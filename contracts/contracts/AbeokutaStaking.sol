// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAavePool.sol";

/**
 * @title AbeokutaStaking
 * @notice Staking contract for the Abeokuta Logos Circle campaign.
 *
 * Stakers deposit USDC which is supplied to Aave V3 to earn yield.
 * Each staker chooses their own yield split between the campaign and themselves.
 * The platform always receives a fixed 2% fee.
 *
 * Default split (can be changed per staker at any time):
 *   • Campaign (cause): 79%  → credited to AbeokutaCampaign via creditDonation
 *   • Staker:           19%  → transferred to staker on claimYield
 *   • Platform:          2%  → sent to FundBrave platform wallet (immutable)
 *
 * Yield accumulator design:
 *   harvestAndDistribute() deducts the 2% platform fee immediately, then
 *   accumulates the remaining 98% ("distributable") in yieldPerTokenStored.
 *   At claimYield() time each staker's personal split is applied to their
 *   accumulated raw yield, so the staker and campaign shares are settled.
 *
 * Because the split is applied at claim time, changing your split affects all
 * unsettled yield (yield accrued since your last settle). The UI makes this clear.
 */
contract AbeokutaStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────
    //  Yield split constants
    // ─────────────────────────────────────────────

    uint256 public constant TOTAL_BASIS       = 10000;
    /// @notice Platform fee — fixed 2%, never adjustable
    uint256 public constant PLATFORM_SHARE    = 200;
    /// @notice Distributable pool = 100% - platform 2% = 98%
    uint256 public constant DISTRIBUTABLE_BPS = 9800;

    /// @notice Default cause share for stakers who haven't customised (79%)
    uint16  public constant DEFAULT_CAUSE_SHARE  = 7900;
    /// @notice Default staker share for stakers who haven't customised (19%)
    uint16  public constant DEFAULT_STAKER_SHARE = 1900;

    // ─────────────────────────────────────────────
    //  Per-staker yield split
    // ─────────────────────────────────────────────

    struct StakerSplit {
        uint16 causeShare;   // bps out of 10000, e.g. 7900 = 79%
        uint16 stakerShare;  // bps out of 10000, e.g. 1900 = 19%
        // Invariant: causeShare + stakerShare == DISTRIBUTABLE_BPS (9800)
        // Detection of "unset": if sum != 9800, getStakerSplit() returns defaults
    }

    mapping(address => StakerSplit) private _stakerSplits;

    // ─────────────────────────────────────────────
    //  Contracts
    // ─────────────────────────────────────────────

    IAavePool public immutable aavePool;
    IERC20    public immutable usdc;
    IERC20    public immutable aUsdc;

    address public campaignContract;
    address public platformWallet;

    // ─────────────────────────────────────────────
    //  Staking state
    // ─────────────────────────────────────────────

    uint256 public totalPrincipal;
    mapping(address => uint256) public stakerPrincipal;

    // Per-token accumulator (Synthetix pattern).
    // Tracks cumulative distributable yield (98%) per staked USDC, scaled by 1e18.
    uint256 public yieldPerTokenStored;
    mapping(address => uint256) public userYieldPerTokenPaid;

    // Raw distributable yield accumulated per staker, not yet split between cause/staker.
    // Split is applied when claimYield() is called.
    mapping(address => uint256) public pendingRawYield;

    uint256 public lastHarvestTimestamp;
    uint256 public totalYieldGenerated;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event Staked(address indexed staker, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);
    event YieldHarvested(
        uint256 totalYield,
        uint256 platformAmount,
        uint256 distributableAmount
    );
    event StakerYieldClaimed(
        address indexed staker,
        uint256 stakerAmount,
        uint256 causeAmount
    );
    event YieldSplitSet(
        address indexed staker,
        uint16  causeShare,
        uint16  stakerShare
    );

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    constructor(
        address _aavePool,
        address _usdc,
        address _aUsdc,
        address _campaignContract,
        address _platformWallet
    ) Ownable(msg.sender) {
        require(_aavePool        != address(0), "Invalid Aave pool");
        require(_usdc            != address(0), "Invalid USDC");
        require(_aUsdc           != address(0), "Invalid aUSDC");
        require(_campaignContract != address(0), "Invalid campaign");
        require(_platformWallet  != address(0), "Invalid platform wallet");

        aavePool         = IAavePool(_aavePool);
        usdc             = IERC20(_usdc);
        aUsdc            = IERC20(_aUsdc);
        campaignContract = _campaignContract;
        platformWallet   = _platformWallet;

        IERC20(_usdc).approve(_aavePool, type(uint256).max);
    }

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

    modifier updateReward(address account) {
        if (account != address(0)) {
            _settleRaw(account);
        }
        _;
    }

    // ─────────────────────────────────────────────
    //  Core — stake
    // ─────────────────────────────────────────────

    function stake(uint256 amount)
        external
        nonReentrant
        whenNotPaused
        updateReward(msg.sender)
    {
        require(amount > 0, "Amount must be > 0");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        aavePool.supply(address(usdc), amount, address(this), 0);

        stakerPrincipal[msg.sender] += amount;
        totalPrincipal += amount;

        emit Staked(msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    //  Core — unstake
    // ─────────────────────────────────────────────

    function unstake(uint256 amount)
        external
        nonReentrant
        whenNotPaused
        updateReward(msg.sender)
    {
        require(amount > 0, "Amount must be > 0");
        require(stakerPrincipal[msg.sender] >= amount, "Insufficient stake");

        stakerPrincipal[msg.sender] -= amount;
        totalPrincipal -= amount;

        aavePool.withdraw(address(usdc), amount, msg.sender);
        emit Unstaked(msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    //  Core — harvest yield from Aave
    // ─────────────────────────────────────────────

    /**
     * @notice Pull yield from Aave, pay platform fee immediately, and
     *         accumulate the remaining distributable pool for stakers to claim.
     * @dev Callable by anyone. Silently returns when no yield is available.
     */
    function harvestAndDistribute() public nonReentrant whenNotPaused {
        uint256 aBalance = aUsdc.balanceOf(address(this));
        if (aBalance <= totalPrincipal) return;

        uint256 yield = aBalance - totalPrincipal;
        aavePool.withdraw(address(usdc), yield, address(this));

        // Platform fee — always 2%, paid immediately
        uint256 platformAmount   = (yield * PLATFORM_SHARE) / TOTAL_BASIS;
        uint256 distributable    = yield - platformAmount;

        if (platformAmount > 0) {
            usdc.safeTransfer(platformWallet, platformAmount);
        }

        // Accumulate distributable yield in the per-token accumulator
        if (totalPrincipal > 0 && distributable > 0) {
            yieldPerTokenStored += (distributable * 1e18) / totalPrincipal;
        }

        totalYieldGenerated  += yield;
        lastHarvestTimestamp  = block.timestamp;

        emit YieldHarvested(yield, platformAmount, distributable);
    }

    // ─────────────────────────────────────────────
    //  Core — claim staker yield
    // ─────────────────────────────────────────────

    /**
     * @notice Claim accumulated yield using the staker's personal split.
     *
     * The raw distributable yield is split at this point:
     *   • staker's causeShare  → credited to AbeokutaCampaign
     *   • staker's stakerShare → transferred to the staker
     *
     * If the campaign contract is unavailable (paused/ended), the cause
     * portion is redirected to the staker so yield is never permanently stuck.
     */
    function claimYield()
        external
        nonReentrant
        whenNotPaused
        updateReward(msg.sender)
    {
        uint256 raw = pendingRawYield[msg.sender];
        if (raw == 0) return;

        pendingRawYield[msg.sender] = 0;

        (, uint16 stakerShare) = getStakerSplit(msg.sender);

        uint256 stakerAmount = (raw * stakerShare) / DISTRIBUTABLE_BPS;
        uint256 causeAmount  = raw - stakerAmount;

        if (stakerAmount > 0) {
            usdc.safeTransfer(msg.sender, stakerAmount);
        }

        // Transfer cause portion to campaign then notify it.
        // Non-reverting call: if campaign is paused/ended the USDC still lands
        // in the treasury multisig where organisers can account for it.
        if (causeAmount > 0 && campaignContract != address(0)) {
            usdc.safeTransfer(campaignContract, causeAmount);
            // solhint-disable-next-line avoid-low-level-calls
            // solhint-disable-next-line no-unused-vars
            (bool _ok,) = campaignContract.call(
                abi.encodeWithSignature(
                    "creditDonation(address,uint256,string)",
                    msg.sender,
                    causeAmount,
                    "staking-yield"
                )
            );
            // _ok intentionally unused — USDC already transferred to treasury
        }

        emit StakerYieldClaimed(msg.sender, stakerAmount, causeAmount);
    }

    // ─────────────────────────────────────────────
    //  Per-staker split configuration
    // ─────────────────────────────────────────────

    /**
     * @notice Set your personal yield split between the campaign and yourself.
     *
     * Only adjusts the cause/staker ratio; the platform's 2% is non-negotiable.
     * Values are in basis points (bps): 1 bp = 0.01%.
     * _causeShare + _stakerShare must equal exactly 9800 (representing the 98%
     * that remains after the platform fee).
     *
     * Examples:
     *   Default altruism:   setYieldSplit(7900, 1900)  → 79% cause, 19% you
     *   More generous:      setYieldSplit(8800, 1000)  → 88% cause, 10% you
     *   Full self-interest: setYieldSplit(0,    9800)  →  0% cause, 98% you
     *   Full donation:      setYieldSplit(9800, 0)     → 98% cause,  0% you
     *
     * Note: changing your split applies to ALL unsettled yield since your last
     * stake / unstake / claim. The UI shows this prominently.
     *
     * @param _causeShare  Basis points (0–9800) directed to the campaign
     * @param _stakerShare Basis points (0–9800) kept by you
     */
    function setYieldSplit(uint16 _causeShare, uint16 _stakerShare) external {
        require(
            uint256(_causeShare) + uint256(_stakerShare) == DISTRIBUTABLE_BPS,
            "causeShare + stakerShare must equal 9800"
        );
        // Settle raw yield first so the OLD split applies to pre-change accruals
        _settleRaw(msg.sender);

        _stakerSplits[msg.sender] = StakerSplit(_causeShare, _stakerShare);
        emit YieldSplitSet(msg.sender, _causeShare, _stakerShare);
    }

    /**
     * @notice Returns the active yield split for a staker.
     *         Returns (DEFAULT_CAUSE_SHARE, DEFAULT_STAKER_SHARE) if not yet customised.
     */
    function getStakerSplit(address staker)
        public
        view
        returns (uint16 causeShare, uint16 stakerShare)
    {
        StakerSplit storage s = _stakerSplits[staker];
        // Detect unset: valid splits always sum to DISTRIBUTABLE_BPS
        if (uint256(s.causeShare) + uint256(s.stakerShare) != DISTRIBUTABLE_BPS) {
            return (DEFAULT_CAUSE_SHARE, DEFAULT_STAKER_SHARE);
        }
        return (s.causeShare, s.stakerShare);
    }

    // ─────────────────────────────────────────────
    //  Internal — accumulator settlement
    // ─────────────────────────────────────────────

    /// @dev Snapshots accrued distributable yield into pendingRawYield for `account`.
    function _settleRaw(address account) private {
        uint256 newRaw = _accruedRaw(account);
        userYieldPerTokenPaid[account] = yieldPerTokenStored;
        if (newRaw > 0) {
            pendingRawYield[account] += newRaw;
        }
    }

    /// @dev Yield accrued since last settle, based on accumulator delta.
    function _accruedRaw(address account) private view returns (uint256) {
        return (stakerPrincipal[account] *
            (yieldPerTokenStored - userYieldPerTokenPaid[account])) / 1e18;
    }

    // ─────────────────────────────────────────────
    //  View functions
    // ─────────────────────────────────────────────

    /**
     * @notice Returns the pending yield breakdown for a staker under their current split.
     * @return stakerPortion USDC the staker will receive on claimYield
     * @return causePortion  USDC that will be credited to the campaign on claimYield
     */
    function pendingYield(address staker)
        external
        view
        returns (uint256 stakerPortion, uint256 causePortion)
    {
        uint256 raw = pendingRawYield[staker] + _accruedRaw(staker);
        if (raw == 0) return (0, 0);

        (, uint16 stakerShare) = getStakerSplit(staker);
        stakerPortion = (raw * stakerShare) / DISTRIBUTABLE_BPS;
        causePortion  = raw - stakerPortion;
    }

    function getStakingStats() external view returns (
        uint256 _totalPrincipal,
        uint256 _totalYieldGenerated,
        uint256 _lastHarvest,
        uint256 _currentAaveBalance,
        uint256 _unrealizedYield
    ) {
        uint256 aBalance  = aUsdc.balanceOf(address(this));
        uint256 unrealized = aBalance > totalPrincipal ? aBalance - totalPrincipal : 0;
        return (
            totalPrincipal,
            totalYieldGenerated,
            lastHarvestTimestamp,
            aBalance,
            unrealized
        );
    }

    // ─────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────

    function setCampaignContract(address _campaign) external onlyOwner {
        require(_campaign != address(0), "Invalid");
        campaignContract = _campaign;
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid");
        platformWallet = _wallet;
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function revokeAaveApproval() external onlyOwner {
        usdc.approve(address(aavePool), 0);
    }

    function restoreAaveApproval() external onlyOwner {
        usdc.approve(address(aavePool), type(uint256).max);
    }
}

