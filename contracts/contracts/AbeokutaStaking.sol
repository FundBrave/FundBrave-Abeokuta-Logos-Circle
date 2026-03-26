// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAavePool.sol";
import "./interfaces/IAbeokutaCampaign.sol";

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

    /// @notice Aave V3 referral code — reserved for future referral program integration
    uint16  private constant AAVE_REFERRAL_CODE = 0;

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
    //  Cause yield escrow (SC-C1)
    // ─────────────────────────────────────────────

    /// @notice Cause yield escrowed after a creditDonation failure (instead of redirecting to staker)
    mapping(address => uint256) public pendingCauseYield;
    /// @notice Timestamp when cause yield was first escrowed (for rescue window)
    mapping(address => uint256) public pendingCauseTimestamp;
    /// @notice 30-day window after which a staker may rescue unclaimed escrowed cause yield
    uint256 public constant CAUSE_YIELD_RESCUE_WINDOW = 30 days;

    // ─────────────────────────────────────────────
    //  Staking deadline (Gap #7)
    // ─────────────────────────────────────────────

    /// @notice Unix timestamp after which new stakes are blocked (0 = no restriction)
    /// Set to the campaign deadline so stakers can't accumulate yield after the campaign ends.
    uint256 public stakingDeadline;

    // ─────────────────────────────────────────────
    //  Staking caps (L-4)
    // ─────────────────────────────────────────────

    /// @notice Maximum USDC a single address may stake (default 100k USDC)
    uint256 public maxStakePerAddress = 100_000 * 1e6;
    /// @notice Maximum total USDC across all stakers (default 1M USDC)
    uint256 public maxGlobalStake = 1_000_000 * 1e6;

    // ─────────────────────────────────────────────
    //  Harvest rate limiting (SC-H2)
    // ─────────────────────────────────────────────

    /// @notice Minimum time between harvests — prevents griefing / gas-waste spam
    uint256 public constant MIN_HARVEST_INTERVAL = 1 hours;

    // ─────────────────────────────────────────────
    //  Campaign contract timelock (SC-H3)
    // ─────────────────────────────────────────────

    /// @notice Pending campaign contract address; address(0) means no change in progress
    address public pendingCampaignContract;
    /// @notice Earliest timestamp at which pendingCampaignContract can be activated
    uint256 public campaignActivationTime;
    /// @notice Timelock delay before a proposed campaign contract can be activated (48 hours)
    uint256 public constant CAMPAIGN_TIMELOCK = 48 hours;

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
    event YieldCreditFailed(address indexed staker, uint256 causeAmount);
    /// @notice SC-C1: Emitted when cause yield is escrowed after a creditDonation failure
    event CauseYieldEscrowed(address indexed staker, uint256 amount);
    /// @notice SC-C1: Emitted when escrowed cause yield is successfully retried to the campaign
    event CauseYieldRetried(address indexed staker, uint256 amount);
    /// @notice SC-C1: Emitted when a staker rescues escrowed yield after the rescue window
    event CauseYieldRescued(address indexed staker, uint256 amount);
    /// @notice SC-M1: Emitted when the campaign contract address is updated (after timelock)
    event CampaignContractUpdated(address indexed newCampaign);
    /// @notice SC-H3: Emitted when a new campaign contract change is proposed
    event CampaignContractProposed(address indexed proposed, uint256 activationTime);
    /// @notice SC-H3: Emitted when a pending campaign contract change is cancelled
    event CampaignContractChangeCancelled();
    /// @notice Gap #7: Emitted when the staking deadline is updated
    event StakingDeadlineSet(uint256 deadline);
    /// @notice Gap #8: Emitted when a staker compounds their yield back into principal
    event YieldCompounded(address indexed staker, uint256 compoundedAmount, uint256 causeAmount);
    /// @notice SC-M1: Emitted when the platform wallet address is updated
    event PlatformWalletUpdated(address indexed newWallet);
    /// @notice L-4: Emitted when staking caps are updated
    event StakingCapsUpdated(uint256 maxPerAddress, uint256 maxGlobal);

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

        // H-2: Use forceApprove for consistency with the rest of the codebase
        IERC20(_usdc).forceApprove(_aavePool, type(uint256).max);
        // M1: Approve campaign to pull USDC via safeTransferFrom in creditDonation
        IERC20(_usdc).forceApprove(_campaignContract, type(uint256).max);
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
        require(amount >= 1e6, "Minimum stake is 1 USDC");
        // Gap #7: Block new stakes after the campaign has ended
        require(
            stakingDeadline == 0 || block.timestamp < stakingDeadline,
            "Campaign ended: staking closed"
        );
        // L-4: Enforce per-address and global caps
        require(stakerPrincipal[msg.sender] + amount <= maxStakePerAddress, "Exceeds per-address cap");
        require(totalPrincipal + amount <= maxGlobalStake, "Exceeds global stake cap");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        aavePool.supply(address(usdc), amount, address(this), AAVE_REFERRAL_CODE);

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
        // M2: If no stakers, skip — withdrawing yield with nobody to distribute to would
        // leave distributable USDC stranded in this contract with no accounting.
        // Leave the yield accumulating in Aave; it will be harvestable once stakers return.
        if (totalPrincipal == 0) return;

        // SC-H2: Rate limit harvests to prevent griefing / gas-waste spam
        if (lastHarvestTimestamp > 0 &&
            block.timestamp < lastHarvestTimestamp + MIN_HARVEST_INTERVAL) return;

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

        // SC-C1: Campaign pulls USDC from this contract via safeTransferFrom (approval set in constructor).
        // If creditDonation reverts (campaign paused/ended), the pull never happened so USDC stays here.
        // The cause portion is escrowed — NOT redirected to the staker — to prevent a malicious staker
        // from pausing the campaign and collecting cause funds as a personal payout.
        // Use retryCauseCredit() to retry, or rescueEscrowedCause() after CAUSE_YIELD_RESCUE_WINDOW.
        if (causeAmount > 0 && campaignContract != address(0)) {
            try IAbeokutaCampaign(campaignContract).creditDonation(
                msg.sender,
                causeAmount,
                "staking-yield"
            ) {} catch {
                // Campaign unavailable — escrow cause portion for later retry (SC-C1)
                pendingCauseYield[msg.sender] += causeAmount;
                if (pendingCauseTimestamp[msg.sender] == 0)
                    pendingCauseTimestamp[msg.sender] = block.timestamp;
                emit CauseYieldEscrowed(msg.sender, causeAmount);
            }
        }

        emit StakerYieldClaimed(msg.sender, stakerAmount, causeAmount);
    }

    // ─────────────────────────────────────────────
    //  Core — compound (Gap #8)
    // ─────────────────────────────────────────────

    /**
     * @notice Compound accumulated yield: re-stakes the staker's portion into Aave
     *         and credits the cause portion to the campaign, atomically.
     *
     * @dev Gap #8: Instead of transferring the staker's yield out, it is re-supplied
     *      to Aave so it starts accruing Aave interest immediately. The cause portion
     *      is still credited to the campaign — compounding only affects the staker's share.
     *      Because the USDC was already withdrawn from Aave by harvestAndDistribute(),
     *      it is in this contract's balance and can be re-supplied directly.
     *
     *      Cannot compound after stakingDeadline — new principal would escape the deadline gate.
     */
    function compound()
        external
        nonReentrant
        whenNotPaused
        updateReward(msg.sender)
    {
        // Gap #7: respect deadline - compounding increases principal
        require(
            stakingDeadline == 0 || block.timestamp < stakingDeadline,
            "Campaign ended: compounding closed"
        );

        uint256 raw = pendingRawYield[msg.sender];
        if (raw == 0) return;

        pendingRawYield[msg.sender] = 0;

        (, uint16 stakerShare) = getStakerSplit(msg.sender);

        uint256 stakerAmount = (raw * stakerShare) / DISTRIBUTABLE_BPS;
        uint256 causeAmount  = raw - stakerAmount;

        // Re-stake the staker's portion directly into Aave
        if (stakerAmount > 0) {
            // H-4: Validate that harvestAndDistribute() has already moved this USDC to the contract
            require(
                usdc.balanceOf(address(this)) >= stakerAmount,
                "Insufficient harvested yield: call harvestAndDistribute first"
            );
            // L-8: Compound must honour the same staking caps as stake() — earned yield should not
            // allow a staker to silently exceed their position limit or the global pool ceiling.
            require(
                stakerPrincipal[msg.sender] + stakerAmount <= maxStakePerAddress,
                "Compound exceeds per-address cap"
            );
            require(
                totalPrincipal + stakerAmount <= maxGlobalStake,
                "Compound exceeds global stake cap"
            );
            aavePool.supply(address(usdc), stakerAmount, address(this), AAVE_REFERRAL_CODE);
            stakerPrincipal[msg.sender] += stakerAmount;
            totalPrincipal += stakerAmount;
        }

        // Credit cause portion to campaign (same logic as claimYield, with SC-C1 escrow)
        if (causeAmount > 0 && campaignContract != address(0)) {
            try IAbeokutaCampaign(campaignContract).creditDonation(
                msg.sender,
                causeAmount,
                "staking-compound"
            ) {} catch {
                pendingCauseYield[msg.sender] += causeAmount;
                if (pendingCauseTimestamp[msg.sender] == 0)
                    pendingCauseTimestamp[msg.sender] = block.timestamp;
                emit CauseYieldEscrowed(msg.sender, causeAmount);
            }
        }

        emit YieldCompounded(msg.sender, stakerAmount, causeAmount);
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
     * Note: This function is intentionally not gated by whenNotPaused, allowing
     * stakers to reconfigure their split even if the contract is paused. This prevents
     * lock-in and ensures protocol responsiveness during emergency pauses.
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

    /**
     * @dev SC-L3: Snapshots accrued distributable yield into pendingRawYield for `account`.
     *      Called by the `updateReward` modifier before any state-mutating function, and
     *      directly by `setYieldSplit` to settle yield under the old split before changing it.
     */
    function _settleRaw(address account) private {
        uint256 newRaw = _accruedRaw(account);
        userYieldPerTokenPaid[account] = yieldPerTokenStored;
        if (newRaw > 0) {
            pendingRawYield[account] += newRaw;
        }
    }

    /**
     * @dev SC-L3: Computes distributable yield accrued since the last settle for `account`.
     *      Uses the Synthetix per-token accumulator pattern:
     *      accrued = principal × (yieldPerTokenStored − userYieldPerTokenPaid) / 1e18
     */
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
    //  Cause yield retry / rescue (SC-C1)
    // ─────────────────────────────────────────────

    /**
     * @notice SC-C1: Retry crediting escrowed cause yield to the campaign.
     * @dev Callable by anyone (trustless retry bot). The USDC is already held in this contract.
     *      If creditDonation still reverts, the whole transaction reverts — try again later.
     * @param staker Address whose escrowed cause yield to retry
     */
    function retryCauseCredit(address staker) external nonReentrant whenNotPaused {
        uint256 amount = pendingCauseYield[staker];
        require(amount > 0, "No pending cause yield");
        require(campaignContract != address(0), "No campaign contract");

        pendingCauseYield[staker] = 0;
        // creditDonation reverts → whole tx reverts → pendingCauseYield is restored
        IAbeokutaCampaign(campaignContract).creditDonation(staker, amount, "staking-yield");
        pendingCauseTimestamp[staker] = 0;
        emit CauseYieldRetried(staker, amount);
    }

    /**
     * @notice SC-C1: Rescue escrowed cause yield after the rescue window has elapsed.
     * @dev Staker-only. Only available after CAUSE_YIELD_RESCUE_WINDOW (30 days) has passed
     *      since the escrow was created. Prevents permanent lock-in if campaign is gone forever.
     */
    function rescueEscrowedCause() external nonReentrant {
        uint256 amount = pendingCauseYield[msg.sender];
        require(amount > 0, "No pending cause yield");
        require(
            pendingCauseTimestamp[msg.sender] > 0 &&
            block.timestamp >= pendingCauseTimestamp[msg.sender] + CAUSE_YIELD_RESCUE_WINDOW,
            "Rescue window not yet open"
        );
        pendingCauseYield[msg.sender] = 0;
        pendingCauseTimestamp[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit CauseYieldRescued(msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────

    // ── Campaign contract timelock (SC-H3) ─────────────────────────────────────

    /**
     * @notice SC-H3: Propose a new campaign contract. Change is effective after CAMPAIGN_TIMELOCK (48h).
     * @dev A pending proposal must be executed or cancelled before a new one can be made,
     *      preventing the owner from resetting the clock indefinitely.
     */
    function proposeCampaignContract(address _campaign) external onlyOwner {
        require(_campaign != address(0), "Invalid campaign");
        require(pendingCampaignContract == address(0), "Proposal already pending");
        pendingCampaignContract = _campaign;
        campaignActivationTime  = block.timestamp + CAMPAIGN_TIMELOCK;
        emit CampaignContractProposed(_campaign, campaignActivationTime);
    }

    /**
     * @notice SC-H3: Execute a proposed campaign contract change after the timelock expires.
     */
    function executeCampaignContract() external onlyOwner {
        require(pendingCampaignContract != address(0), "No pending campaign");
        require(block.timestamp >= campaignActivationTime, "Timelock not expired");
        usdc.forceApprove(campaignContract, 0);
        campaignContract = pendingCampaignContract;
        usdc.forceApprove(campaignContract, type(uint256).max);
        pendingCampaignContract = address(0);
        campaignActivationTime  = 0;
        emit CampaignContractUpdated(campaignContract);
    }

    /**
     * @notice SC-H3: Cancel a pending campaign contract change before it is executed.
     */
    function cancelCampaignContractChange() external onlyOwner {
        require(pendingCampaignContract != address(0), "No pending change");
        pendingCampaignContract = address(0);
        campaignActivationTime  = 0;
        emit CampaignContractChangeCancelled();
    }

    /// @notice Gap #7: Set the deadline after which new stakes (and compounding) are blocked.
    /// @dev Set to match the campaign deadline. Pass 0 to remove the restriction.
    function setStakingDeadline(uint256 _deadline) external onlyOwner {
        stakingDeadline = _deadline;
        emit StakingDeadlineSet(_deadline);
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid");
        platformWallet = _wallet;
        emit PlatformWalletUpdated(_wallet);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function revokeAaveApproval() external onlyOwner {
        usdc.forceApprove(address(aavePool), 0);         // L3
    }

    function restoreAaveApproval() external onlyOwner {
        usdc.forceApprove(address(aavePool), type(uint256).max);  // L3
    }

    /// @notice M3: Rescue stuck tokens (e.g. un-harvested aUSDC yield when no stakers remain)
    /// @dev H-1: USDC is excluded — it belongs to stakers and must flow through claimYield/compound.
    ///      Only non-USDC assets (e.g. accidentally received tokens, aUSDC) may be rescued.
    function emergencyWithdraw(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(token != address(usdc), "Cannot rescue USDC: use claim functions");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to rescue");
        IERC20(token).safeTransfer(to, bal);
    }

    /// @notice L-4: Update per-address and global staking caps. Owner only.
    function setStakingCaps(uint256 _maxPerAddress, uint256 _maxGlobal) external onlyOwner {
        require(_maxPerAddress > 0 && _maxGlobal > 0, "Caps must be > 0");
        maxStakePerAddress = _maxPerAddress;
        maxGlobalStake     = _maxGlobal;
        emit StakingCapsUpdated(_maxPerAddress, _maxGlobal);
    }
}

