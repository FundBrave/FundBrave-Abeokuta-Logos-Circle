// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISwapAdapter.sol";
import "./libraries/CircuitBreaker.sol";

/**
 * @title AbeokutaCampaign
 * @notice Single-purpose fundraising contract for the Abeokuta Logos Circle campaign.
 *
 * This contract supports the "Empowering Women Entrepreneurs in Abeokuta" campaign,
 * raising $1,000–$2,500 USDC to fund online education courses for 20–30 women.
 *
 * Donation flows supported:
 *   1. Direct USDC donation (no swap needed)
 *   2. ERC20 token donation → auto-swapped to USDC via DEX adapter
 *   3. Native ETH donation → auto-swapped to USDC via DEX adapter
 *   4. Cross-chain donation (routed via FundBraveBridge → creditDonation here)
 *
 * Treasury: Funds accumulate on-chain; withdrawal requires a Gnosis Safe multisig
 * (configured as the `treasury` address) to sign off.
 *
 * @dev Non-upgradeable for simplicity and auditability.
 *      Inherits CircuitBreaker library from FundBrave for rate-limiting protection.
 */
contract AbeokutaCampaign is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using CircuitBreaker for CircuitBreaker.BreakerConfig;

    // ─────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────

    struct DonationRecord {
        address donor;
        uint256 amount;      // USDC (6 decimals)
        uint256 timestamp;
        address tokenIn;     // Original token donated (address(0) = ETH)
        string  sourceChain; // "base" for same-chain, chain name for cross-chain
    }

    // ─────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────

    IERC20 public immutable usdc;
    ISwapAdapter public swapAdapter;

    /// @notice Gnosis Safe multisig — only address that can receive withdrawn funds
    address public treasury;

    /// @notice Bridge contract authorised to call creditDonation (LayerZero receiver)
    address public bridgeContract;

    /// @notice Staking pool authorised to call creditDonation with yield contributions
    address public stakingPool;

    uint256 public goalMin;   // Lower bound of goal range (USDC, 6 decimals)
    uint256 public goalMax;   // Upper bound of goal range (USDC, 6 decimals)
    uint256 public deadline;

    uint256 public totalRaised;    // Cumulative USDC received
    uint256 public donorCount;     // Unique donor addresses

    DonationRecord[] private _allDonations;
    mapping(address => uint256) public donorTotalContributed;
    mapping(address => bool) private _isDonor;

    CircuitBreaker.BreakerConfig private _circuitBreaker;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event Donated(
        address indexed donor,
        uint256 usdcAmount,
        address tokenIn,
        string sourceChain
    );
    event Withdrawn(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed newTreasury);
    event BridgeUpdated(address indexed newBridge);
    event StakingPoolUpdated(address indexed newPool);
    event DeadlineExtended(uint256 newDeadline);

    // ─────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────

    error CampaignEnded();
    error CampaignNotEnded();
    error GoalNotReached();
    error ZeroAmount();
    error Unauthorized();
    error CircuitBreakerActive();
    error TransactionBlocked();
    error InsufficientNativeForFee();

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    /**
     * @param _usdc      USDC token address on target chain
     * @param _swap      DEX swap adapter (UniswapAdapter or OneInchAdapter)
     * @param _treasury  Gnosis Safe multisig address for the campaign
     * @param _goalMin   Minimum goal in USDC (6 decimals), e.g. 1_000 * 1e6
     * @param _goalMax   Maximum goal in USDC (6 decimals), e.g. 2_500 * 1e6
     * @param _deadline  Unix timestamp when campaign ends
     */
    constructor(
        address _usdc,
        address _swap,
        address _treasury,
        uint256 _goalMin,
        uint256 _goalMax,
        uint256 _deadline
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        require(_treasury != address(0), "Invalid treasury");
        require(_goalMin > 0 && _goalMax >= _goalMin, "Invalid goal range");
        require(_deadline > block.timestamp, "Deadline in past");

        usdc = IERC20(_usdc);
        swapAdapter = ISwapAdapter(_swap);
        treasury = _treasury;
        goalMin = _goalMin;
        goalMax = _goalMax;
        deadline = _deadline;

        // Circuit breaker: max single tx = 5k USDC, hourly = 10k, daily = 30k
        _circuitBreaker.initialize(
            5_000 * 1e6,
            10_000 * 1e6,
            30_000 * 1e6
        );
    }

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

    modifier onlyActive() {
        if (block.timestamp >= deadline) revert CampaignEnded();
        _;
    }

    modifier onlyBridgeOrStaking() {
        if (msg.sender != bridgeContract && msg.sender != stakingPool)
            revert Unauthorized();
        _;
    }

    // ─────────────────────────────────────────────
    //  Donation — same-chain USDC (no swap)
    // ─────────────────────────────────────────────

    /**
     * @notice Donate USDC directly. Caller must approve this contract first.
     * @param amount USDC amount in 6-decimal units
     */
    function donateUSDC(uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyActive
    {
        if (amount == 0) revert ZeroAmount();
        _checkCircuitBreaker(amount);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _recordDonation(msg.sender, amount, address(usdc), "base");
    }

    // ─────────────────────────────────────────────
    //  Donation — same-chain ERC20 (auto-swap)
    // ─────────────────────────────────────────────

    /**
     * @notice Donate any ERC20 token. It will be swapped to USDC automatically.
     * @param tokenIn  ERC20 token address
     * @param amountIn Amount of tokenIn (caller must approve this contract)
     */
    function donateERC20(address tokenIn, uint256 amountIn)
        external
        nonReentrant
        whenNotPaused
        onlyActive
    {
        if (amountIn == 0) revert ZeroAmount();

        // If already USDC, skip swap path
        if (tokenIn == address(usdc)) {
            usdc.safeTransferFrom(msg.sender, address(this), amountIn);
            _checkCircuitBreaker(amountIn);
            _recordDonation(msg.sender, amountIn, tokenIn, "base");
            return;
        }

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(swapAdapter), amountIn);

        uint256 usdcOut = swapAdapter.swapToUSDT(tokenIn, amountIn);
        if (usdcOut == 0) revert ZeroAmount();

        _checkCircuitBreaker(usdcOut);
        _recordDonation(msg.sender, usdcOut, tokenIn, "base");
    }

    // ─────────────────────────────────────────────
    //  Donation — same-chain native ETH (auto-swap)
    // ─────────────────────────────────────────────

    /**
     * @notice Donate native ETH. Swapped to USDC automatically.
     */
    function donateETH()
        external
        payable
        nonReentrant
        whenNotPaused
        onlyActive
    {
        if (msg.value == 0) revert ZeroAmount();

        uint256 usdcOut = swapAdapter.swapNativeToUSDT{value: msg.value}();
        if (usdcOut == 0) revert ZeroAmount();

        _checkCircuitBreaker(usdcOut);
        _recordDonation(msg.sender, usdcOut, address(0), "base");
    }

    // ─────────────────────────────────────────────
    //  Donation — cross-chain (called by bridge)
    // ─────────────────────────────────────────────

    /**
     * @notice Credit a cross-chain donation. Called by FundBraveBridge after bridging USDC here.
     * @dev The bridge must have already transferred USDC to this contract.
     * @param donor       Original donor address on source chain
     * @param amount      USDC amount (6 decimals)
     * @param sourceChain Human-readable source chain name (e.g. "ethereum", "polygon")
     */
    function creditDonation(
        address donor,
        uint256 amount,
        string calldata sourceChain
    ) external nonReentrant whenNotPaused onlyActive onlyBridgeOrStaking {
        if (amount == 0) revert ZeroAmount();
        _checkCircuitBreaker(amount);
        _recordDonation(donor, amount, address(usdc), sourceChain);
    }

    // ─────────────────────────────────────────────
    //  Withdrawal (multisig treasury only)
    // ─────────────────────────────────────────────

    /**
     * @notice Withdraw all raised USDC to the Gnosis Safe treasury.
     * @dev Can be called any time goal is reached, or after deadline regardless.
     *      The multisig enforces the multi-signature requirement — this contract
     *      trusts that treasury is a properly configured Gnosis Safe.
     */
    function withdrawToTreasury() external nonReentrant {
        if (msg.sender != treasury && msg.sender != owner())
            revert Unauthorized();
        if (block.timestamp < deadline && totalRaised < goalMin)
            revert GoalNotReached();

        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");

        usdc.safeTransfer(treasury, balance);
        emit Withdrawn(treasury, balance);
    }

    // ─────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────

    function _recordDonation(
        address donor,
        uint256 amount,
        address tokenIn,
        string memory sourceChain
    ) private {
        if (!_isDonor[donor]) {
            _isDonor[donor] = true;
            donorCount++;
        }

        donorTotalContributed[donor] += amount;
        totalRaised += amount;

        _allDonations.push(DonationRecord({
            donor:       donor,
            amount:      amount,
            timestamp:   block.timestamp,
            tokenIn:     tokenIn,
            sourceChain: sourceChain
        }));

        emit Donated(donor, amount, tokenIn, sourceChain);
    }

    function _checkCircuitBreaker(uint256 amount) private {
        if (_circuitBreaker.isTriggered()) revert CircuitBreakerActive();
        if (!_circuitBreaker.checkTransaction(amount)) revert TransactionBlocked();
    }

    // ─────────────────────────────────────────────
    //  View functions
    // ─────────────────────────────────────────────

    function getDonationsCount() external view returns (uint256) {
        return _allDonations.length;
    }

    /**
     * @notice Returns recent donations for the live feed (paginated, newest first).
     * @param offset  Starting index (0 = newest)
     * @param limit   Maximum records to return (capped at 50)
     */
    function getRecentDonations(uint256 offset, uint256 limit)
        external
        view
        returns (DonationRecord[] memory records)
    {
        uint256 total = _allDonations.length;
        if (total == 0 || offset >= total) return new DonationRecord[](0);

        uint256 cap = limit > 50 ? 50 : limit;
        uint256 available = total - offset;
        uint256 count = available < cap ? available : cap;

        records = new DonationRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            // Newest first: read from end of array
            records[i] = _allDonations[total - 1 - offset - i];
        }
    }

    /**
     * @notice Returns key campaign stats for the dashboard.
     */
    function getCampaignStats() external view returns (
        uint256 _totalRaised,
        uint256 _goalMin,
        uint256 _goalMax,
        uint256 _deadline,
        uint256 _donorCount,
        uint256 _donationsCount,
        bool    _isActive,
        bool    _minGoalReached
    ) {
        return (
            totalRaised,
            goalMin,
            goalMax,
            deadline,
            donorCount,
            _allDonations.length,
            block.timestamp < deadline,
            totalRaised >= goalMin
        );
    }

    function isActive() external view returns (bool) {
        return block.timestamp < deadline;
    }

    function progressBps() external view returns (uint256) {
        if (goalMax == 0) return 0;
        uint256 bps = (totalRaised * 10000) / goalMax;
        return bps > 10000 ? 10000 : bps;
    }

    // ─────────────────────────────────────────────
    //  Admin functions
    // ─────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setBridgeContract(address _bridge) external onlyOwner {
        bridgeContract = _bridge;
        emit BridgeUpdated(_bridge);
    }

    function setStakingPool(address _pool) external onlyOwner {
        stakingPool = _pool;
        emit StakingPoolUpdated(_pool);
    }

    function setSwapAdapter(address _swap) external onlyOwner {
        swapAdapter = ISwapAdapter(_swap);
    }

    function extendDeadline(uint256 newDeadline) external onlyOwner {
        require(newDeadline > deadline, "Must be later");
        deadline = newDeadline;
        emit DeadlineExtended(newDeadline);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function resetCircuitBreaker() external onlyOwner {
        _circuitBreaker.reset();
    }

    function updateCircuitBreakerLimits(
        uint256 maxTx,
        uint256 maxHourly,
        uint256 maxDaily
    ) external onlyOwner {
        _circuitBreaker.updateLimits(maxTx, maxHourly, maxDaily);
    }

    /// @notice Emergency drain — only callable by owner to rescue stuck tokens
    function emergencyWithdrawToken(address token, address to) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to rescue");
        IERC20(token).safeTransfer(to, bal);
    }

    receive() external payable {}
}
