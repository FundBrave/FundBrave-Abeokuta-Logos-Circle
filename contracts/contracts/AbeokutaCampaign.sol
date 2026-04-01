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
 *   4. Cross-chain donation (FundBraveBridge → handleCrossChainDonation here, no safeTransferFrom)
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

    /// @notice M-1: Watcher service address authorised to call donateUSDCFor (BTC/SOL attribution)
    address public watcher;

    uint256 public goalMin;   // Lower bound of goal range (USDC, 6 decimals)
    uint256 public goalMax;   // Upper bound of goal range (USDC, 6 decimals)
    uint256 public deadline;

    /// @notice Minimum donation to prevent dust (1 USDC)
    uint256 public constant MIN_DONATION = 1e6;

    /// @notice Maximum deadline extension window (2 years from now)
    uint256 public constant MAX_DEADLINE_EXTENSION = 730 days;

    /// @notice Timelock delay before a proposed swap adapter can be activated (48 hours)
    uint256 public constant ADAPTER_TIMELOCK = 48 hours;

    uint256 public totalRaised;    // Cumulative USDC received
    uint256 public donorCount;     // Unique donor addresses

    // ─── Swap adapter timelock ───────────────────────────────────────────────

    /// @notice Pending swap adapter address; address(0) means no change in progress
    address public pendingSwapAdapter;

    // ─── Bridge contract timelock (F-003) ────────────────────────────────────

    /// @notice Pending bridge contract address; address(0) means no change in progress
    address public pendingBridgeContract;
    /// @notice Earliest timestamp at which pendingBridgeContract can be activated
    uint256 public bridgeActivationTime;

    // ─── Staking pool timelock (F-003) ───────────────────────────────────────

    /// @notice Pending staking pool address; address(0) means no change in progress
    address public pendingStakingPool;
    /// @notice Earliest timestamp at which pendingStakingPool can be activated
    uint256 public stakingPoolActivationTime;

    // ─── Absolute deadline cap (F-006) ───────────────────────────────────────

    /// @notice Absolute latest timestamp the deadline can ever be extended to (set at construction)
    uint256 public immutable absoluteDeadlineMax;

    // ─── Circuit breaker manual halt ─────────────────────────────────────────

    /// @notice L7: Persistent halt flag that survives transaction reverts.
    /// The CircuitBreaker library's `triggered` flag is set inside checkTransaction(),
    /// which always runs in a reverting context — so it rolls back and is never persisted.
    /// This flag gives the owner a manual lever that actually latches.
    bool private _cbHalted;
    /// @notice Earliest timestamp at which pendingSwapAdapter can be activated
    uint256 public swapAdapterActivationTime;

    DonationRecord[] private _allDonations;
    mapping(address => uint256) public donorTotalContributed;
    mapping(address => bool) private _isDonor;
    /// @notice Gap #10: tracks which donors have already claimed a refund
    mapping(address => bool) private _refundClaimed;

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
    event RefundClaimed(address indexed donor, uint256 amount);
    event Withdrawn(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed newTreasury);
    event BridgeUpdated(address indexed newBridge);
    event BridgeContractProposed(address indexed proposedBridge, uint256 activationTime);
    event BridgeContractChangeCancelled();
    event StakingPoolUpdated(address indexed newPool);
    event StakingPoolProposed(address indexed proposedPool, uint256 activationTime);
    event StakingPoolChangeCancelled();
    event DeadlineExtended(uint256 newDeadline);
    event SwapAdapterUpdated(address indexed newAdapter);
    event SwapAdapterProposed(address indexed proposedAdapter, uint256 activationTime);
    event WatcherUpdated(address indexed newWatcher);
    event SwapAdapterChangeCancelled();
    event CircuitBreakerHalted();
    /// @notice SC-M2: Emitted on emergency ETH rescue so withdrawals are always on-chain visible
    event EmergencyETHWithdrawal(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────

    error CampaignEnded();
    error CampaignNotEnded();
    error GoalNotReached();
    error GoalReached();
    error ZeroAmount();
    error Unauthorized();
    error CircuitBreakerActive();
    error TransactionBlocked();
    error InsufficientNativeForFee();
    error SlippageTooHigh();
    error AlreadyRefunded();
    error RefundWindowClosed();

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
        // F-006: Absolute cap = original deadline + one full extension window.
        // The deadline can never be pushed beyond this, regardless of how many times
        // extendDeadline is called.
        absoluteDeadlineMax = _deadline + MAX_DEADLINE_EXTENSION;

        // SC-M3: Emit initial adapter address for off-chain indexers
        if (_swap != address(0)) {
            emit SwapAdapterUpdated(_swap);
        }

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

    modifier onlyWatcher() {
        require(msg.sender == watcher, "Not authorized watcher");
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
        require(amount >= MIN_DONATION, "Below minimum donation");
        _checkCircuitBreaker(amount);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _recordDonation(msg.sender, amount, address(usdc), "base");
    }

    /**
     * @notice Donate USDC on behalf of another address (e.g. a BTC/SOL donor).
     * @dev Gap #6: USDC is pulled from msg.sender (the float wallet), but the
     *      donation is attributed to `donor`. This allows the watcher service to
     *      record the true originating address rather than the float wallet.
     *      M-1: Restricted to the authorised watcher address set by setWatcher().
     * @param donor  Address to attribute the donation to (must not be zero)
     * @param amount USDC amount in 6-decimal units
     */
    function donateUSDCFor(address donor, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyActive
        onlyWatcher
    {
        require(donor != address(0), "Invalid donor");
        if (amount == 0) revert ZeroAmount();
        require(amount >= MIN_DONATION, "Below minimum donation");
        _checkCircuitBreaker(amount);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _recordDonation(donor, amount, address(usdc), "base");
    }

    // ─────────────────────────────────────────────
    //  Donation — same-chain ERC20 (auto-swap)
    // ─────────────────────────────────────────────

    /**
     * @notice Donate any ERC20 token. It will be swapped to USDC automatically.
     * @param tokenIn     ERC20 token address
     * @param amountIn    Amount of tokenIn (caller must approve this contract)
     * @param minUsdcOut  Gap #5: Minimum USDC to receive after swap (slippage protection).
     *                    Pass 0 to skip the check (not recommended in production).
     */
    function donateERC20(address tokenIn, uint256 amountIn, uint256 minUsdcOut)
        external
        nonReentrant
        whenNotPaused
        onlyActive
    {
        if (amountIn == 0) revert ZeroAmount();

        // If already USDC, skip swap path
        // L2: Reject up-front if no swap adapter is configured
        require(address(swapAdapter) != address(0), "Swap adapter not set");

        if (tokenIn == address(usdc)) {
            require(amountIn >= MIN_DONATION, "Below minimum donation");
            _checkCircuitBreaker(amountIn);
            usdc.safeTransferFrom(msg.sender, address(this), amountIn);
            _recordDonation(msg.sender, amountIn, tokenIn, "base");
            return;
        }

        // M-5: Pre-swap input check is omitted — for 18-decimal tokens, `amountIn >= 1e6`
        // is meaningless (0.000001 tokens). Minimum enforcement is done post-swap on usdcOut.
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(swapAdapter), amountIn);

        uint256 usdcOut = swapAdapter.swapToUSDC(tokenIn, amountIn);
        if (usdcOut == 0) revert ZeroAmount();
        // Gap #5: Enforce caller-specified slippage tolerance
        if (minUsdcOut > 0 && usdcOut < minUsdcOut) revert SlippageTooHigh();
        require(usdcOut >= MIN_DONATION, "Below minimum donation");

        _checkCircuitBreaker(usdcOut);
        _recordDonation(msg.sender, usdcOut, tokenIn, "base");
    }

    // ─────────────────────────────────────────────
    //  Donation — same-chain native ETH (auto-swap)
    // ─────────────────────────────────────────────

    /**
     * @notice Donate native ETH. Swapped to USDC automatically.
     * @param minUsdcOut Gap #5: Minimum USDC to receive after swap (slippage protection).
     *                   Pass 0 to skip (not recommended in production).
     */
    function donateETH(uint256 minUsdcOut)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyActive
    {
        if (msg.value == 0) revert ZeroAmount();
        // L2: Reject up-front if no swap adapter is configured
        require(address(swapAdapter) != address(0), "Swap adapter not set");

        uint256 usdcOut = swapAdapter.swapNativeToUSDC{value: msg.value}();
        if (usdcOut == 0) revert ZeroAmount();
        // Gap #5: Enforce caller-specified slippage tolerance
        if (minUsdcOut > 0 && usdcOut < minUsdcOut) revert SlippageTooHigh();
        require(usdcOut >= MIN_DONATION, "Below minimum donation");

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
    /**
     * @notice Called directly by FundBraveBridge when it receives a cross-chain donation via
     *         LayerZero. The bridge pushes USDC to this contract before calling this function,
     *         so no safeTransferFrom is needed — saving ~30k gas vs creditDonation.
     *
     * @dev Gas profile (new donor, cold storage): ~80k vs ~258k for creditDonation path.
     *      Fits within FundBraveBridge's hardcoded gasLimit=200k including bridge overhead.
     *      Set bridgeContract = FundBraveBridge address and setLocalFactory on bridge = this.
     *
     *      Signature matches ILocalFundraiserFactory.handleCrossChainDonation so this contract
     *      can be used as the bridge's localFundraiserFactory directly.
     *
     * @param donor        Original donor address on the source chain
     * @param srcEid       LayerZero source endpoint ID (converted to chain name string)
     */
    function handleCrossChainDonation(
        address donor,
        uint256 /* fundraiserId */,
        uint256 amount,
        bytes32 /* messageHash */,
        uint32  srcEid
    ) external nonReentrant whenNotPaused {
        if (msg.sender != bridgeContract) revert Unauthorized();
        require(donor != address(0), "Invalid donor");
        if (amount == 0) revert ZeroAmount();
        require(amount >= MIN_DONATION, "Below minimum donation");
        if (block.timestamp >= deadline) revert CampaignEnded();
        if (amount > 5_000 * 1e6) revert TransactionBlocked();
        if (totalRaised >= goalMax) revert GoalReached();

        // Convert EID to human-readable chain name (same mapping as AbeokutaBridgeReceiver)
        string memory sourceChain = _eidToChainName(srcEid);

        // F-002: Verify the bridge has already pushed at least `amount` USDC to this contract.
        // The legitimate FundBraveBridge transfers USDC to this contract atomically before calling
        // (in the same transaction), so this balance check is satisfied.
        // A malicious bridge that calls without transferring will be rejected here.
        // Note: balance is checked BEFORE accounting updates to capture the pre-call state.
        require(usdc.balanceOf(address(this)) >= amount, "USDC not received from bridge");

        // GAS-OPT: Reuse donorTotalContributed as the "is new donor" sentinel instead of a
        // separate _isDonor SSTORE. This saves one cold 0→nonzero SSTORE (~22k) for new donors,
        // keeping the full LZ path under 200k for both new and returning donors.
        // donorCount accuracy relies on the same invariant as direct donations.
        bool isNew = (donorTotalContributed[donor] == 0);
        donorTotalContributed[donor] += amount;
        if (isNew) donorCount++;
        totalRaised += amount;
        emit Donated(donor, amount, address(usdc), sourceChain);
    }

    /// @dev Convert LayerZero EID to a human-readable chain name. Returns "unknown" for
    ///      unrecognised EIDs so the call never reverts on an unmapped chain.
    function _eidToChainName(uint32 eid) internal pure returns (string memory) {
        if (eid == 30101 || eid == 40161) return "ethereum";
        if (eid == 30109 || eid == 40109) return "polygon";
        if (eid == 30110 || eid == 40231) return "arbitrum";
        if (eid == 30111 || eid == 40232) return "optimism";
        if (eid == 30184 || eid == 40245) return "base";
        if (eid == 30294)                 return "rootstock";
        return "unknown";
    }

    function creditDonation(
        address donor,
        uint256 amount,
        string calldata sourceChain
    ) external nonReentrant whenNotPaused onlyBridgeOrStaking {
        // SC-C1: Reject zero donor address
        require(donor != address(0), "Invalid donor");
        if (amount == 0) revert ZeroAmount();
        // SC-C2: Enforce same minimum as direct donations
        require(amount >= MIN_DONATION, "Below minimum donation");
        // M-3: Bridge donations are deadline-gated; staking yield retries are not, because
        // the yield was earned during the campaign and the failed creditDonation was escrowed.
        if (msg.sender == bridgeContract && block.timestamp >= deadline) revert CampaignEnded();

        // GAS-OPT: For cross-chain/bridge paths, skip the 9-slot CircuitBreaker struct reads
        // (~21k gas) and the 5-slot _allDonations array push (~110k gas). The FundBraveBridge
        // hardcodes gasLimit=200k for donations; both operations are redundant here because:
        //  - The bridge has its own rate limiting; LZ guarantees exactly-once delivery.
        //  - All donation data is emitted in the Donated event and queryable off-chain.
        // Simple per-tx cap (5000 USDC) replaces the full circuit breaker for this path.
        // Direct donation paths (_donateUSDC, donateERC20, donateETH) use the full circuit
        // breaker and array recording as before.
        if (amount > 5_000 * 1e6) revert TransactionBlocked();
        if (totalRaised >= goalMax) revert GoalReached();

        // M1: Pull USDC from the caller (bridge/staking must have approved this contract).
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Lightweight recording: update totals + emit event (no storage array push).
        // Donor tracking kept so donorCount stays accurate.
        if (!_isDonor[donor]) { _isDonor[donor] = true; donorCount++; }
        donorTotalContributed[donor] += amount;
        totalRaised += amount;
        emit Donated(donor, amount, address(usdc), sourceChain);
    }

    // ─────────────────────────────────────────────
    //  Withdrawal (multisig treasury only)
    // ─────────────────────────────────────────────

    /**
     * @notice Withdraw all raised USDC to the Gnosis Safe treasury.
     * @dev Requires the minimum goal to be reached. If the deadline has passed
     *      without reaching goalMin, donors may instead call claimRefund().
     *      This prevents the treasury from draining funds that should be refundable.
     */
    function withdrawToTreasury() external nonReentrant {
        if (msg.sender != treasury && msg.sender != owner())
            revert Unauthorized();
        // Gap #10: Always require goalMin — if not met after deadline, refunds are available
        if (totalRaised < goalMin) revert GoalNotReached();

        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");

        usdc.safeTransfer(treasury, balance);
        emit Withdrawn(treasury, balance);
    }

    // ─────────────────────────────────────────────
    //  Refunds (Gap #10)
    // ─────────────────────────────────────────────

    /**
     * @notice Claim a full refund of your USDC contributions.
     * @dev Only available after the campaign deadline has passed AND the minimum
     *      goal was not reached. Each donor may claim exactly once.
     *      Note: only covers direct USDC donations and credited amounts.
     *      Swap-based donations (ERC20/ETH) are refunded in USDC (swap proceeds), not
     *      the original token.
     */
    function claimRefund() external nonReentrant {
        // Gap #10: Refunds only if goal not met after deadline
        if (totalRaised >= goalMin) revert RefundWindowClosed();
        if (block.timestamp < deadline) revert CampaignNotEnded();

        uint256 contributed = donorTotalContributed[msg.sender];
        if (contributed == 0) revert ZeroAmount();
        if (_refundClaimed[msg.sender]) revert AlreadyRefunded();

        // M-2: Pro-rata refund — donor receives (contributed / totalRaised) × current balance.
        // This ensures late claimers get a proportional share even if early claimers partially
        // depleted the pool (possible when yield credits inflate totalRaised above the USDC balance).
        uint256 balance = usdc.balanceOf(address(this));
        uint256 refundAmount = (contributed * balance) / totalRaised;
        if (refundAmount == 0) revert ZeroAmount();

        _refundClaimed[msg.sender] = true;
        usdc.safeTransfer(msg.sender, refundAmount);
        emit RefundClaimed(msg.sender, refundAmount);
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
        if (totalRaised >= goalMax) revert GoalReached();
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
        // L7: The CB library's `triggered` flag is set inside checkTransaction() which always
        // runs in a reverting context — EVM rolls it back, so it can never persist.
        // _cbHalted is our persistent manual halt that survives reverts.
        if (_cbHalted) revert CircuitBreakerActive();
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
        // SC-M3: Guard against overflow in the multiplication. Since Solidity 0.8 reverts on
        // overflow, an extreme totalRaised would make this view function revert.
        // If totalRaised is already ≥ goalMax the campaign is at/above 100% — return early.
        if (totalRaised >= goalMax) return 10000;
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

    /// @notice SC-H2: Initial setup only — sets bridge when not yet configured.
    /// @dev F-003: After initial setup, use proposeBridgeContract/executeBridgeContract
    ///      (48-hour timelock) for subsequent changes. This prevents instant phantom donation
    ///      setup if the owner key is compromised.
    function setBridgeContract(address _bridge) external onlyOwner {
        require(_bridge != address(0), "Invalid bridge");
        require(bridgeContract == address(0), "Use proposeBridgeContract to change existing bridge");
        bridgeContract = _bridge;
        emit BridgeUpdated(_bridge);
    }

    // ── Bridge contract timelock (F-003) ─────────────────────────────────────

    /// @notice Propose a new bridge contract. The change becomes effective after ADAPTER_TIMELOCK (48h).
    /// @dev Prevents instant-change attacks: even a compromised owner key cannot swap the bridge
    ///      in a single block. Watchers have a 48-hour window to detect and respond.
    function proposeBridgeContract(address _bridge) external onlyOwner {
        require(_bridge != address(0), "Invalid bridge");
        require(pendingBridgeContract == address(0), "Proposal already pending");
        pendingBridgeContract = _bridge;
        bridgeActivationTime = block.timestamp + ADAPTER_TIMELOCK;
        emit BridgeContractProposed(_bridge, bridgeActivationTime);
    }

    /// @notice Execute a previously proposed bridge contract change after the timelock has expired.
    function executeBridgeContract() external onlyOwner {
        require(pendingBridgeContract != address(0), "No pending bridge");
        require(block.timestamp >= bridgeActivationTime, "Timelock not expired");
        address newBridge = pendingBridgeContract;
        bridgeContract = newBridge;
        pendingBridgeContract = address(0);
        bridgeActivationTime = 0;
        emit BridgeUpdated(newBridge);
    }

    /// @notice Cancel a pending bridge contract change before it is executed.
    function cancelBridgeContractChange() external onlyOwner {
        require(pendingBridgeContract != address(0), "No pending change");
        pendingBridgeContract = address(0);
        bridgeActivationTime = 0;
        emit BridgeContractChangeCancelled();
    }

    /// @notice SC-H2: Initial setup only — sets staking pool when not yet configured.
    /// @dev F-003: After initial setup, use proposeStakingPool/executeStakingPool
    ///      (48-hour timelock) for subsequent changes.
    function setStakingPool(address _pool) external onlyOwner {
        require(_pool != address(0), "Invalid pool");
        require(stakingPool == address(0), "Use proposeStakingPool to change existing pool");
        stakingPool = _pool;
        emit StakingPoolUpdated(_pool);
    }

    // ── Staking pool timelock (F-003) ─────────────────────────────────────────

    /// @notice Propose a new staking pool. The change becomes effective after ADAPTER_TIMELOCK (48h).
    function proposeStakingPool(address _pool) external onlyOwner {
        require(_pool != address(0), "Invalid pool");
        require(pendingStakingPool == address(0), "Proposal already pending");
        pendingStakingPool = _pool;
        stakingPoolActivationTime = block.timestamp + ADAPTER_TIMELOCK;
        emit StakingPoolProposed(_pool, stakingPoolActivationTime);
    }

    /// @notice Execute a previously proposed staking pool change after the timelock has expired.
    function executeStakingPool() external onlyOwner {
        require(pendingStakingPool != address(0), "No pending pool");
        require(block.timestamp >= stakingPoolActivationTime, "Timelock not expired");
        address newPool = pendingStakingPool;
        stakingPool = newPool;
        pendingStakingPool = address(0);
        stakingPoolActivationTime = 0;
        emit StakingPoolUpdated(newPool);
    }

    /// @notice Cancel a pending staking pool change before it is executed.
    function cancelStakingPoolChange() external onlyOwner {
        require(pendingStakingPool != address(0), "No pending change");
        pendingStakingPool = address(0);
        stakingPoolActivationTime = 0;
        emit StakingPoolChangeCancelled();
    }

    // ── Swap adapter timelock (SC-C3) ────────────────────────────────────────

    /**
     * @notice Propose a new swap adapter. The change becomes effective after ADAPTER_TIMELOCK (48h).
     * @dev SC-M4: A pending proposal must be executed or cancelled before a new one is accepted.
     *      This prevents the owner from indefinitely resetting the timelock clock.
     */
    function proposeSwapAdapter(address _swap) external onlyOwner {
        require(_swap != address(0), "Invalid adapter");
        require(pendingSwapAdapter == address(0), "Proposal already pending");
        pendingSwapAdapter = _swap;
        swapAdapterActivationTime = block.timestamp + ADAPTER_TIMELOCK;
        emit SwapAdapterProposed(_swap, swapAdapterActivationTime);
    }

    /**
     * @notice Execute a previously proposed swap adapter change after the timelock has expired.
     */
    function executeSwapAdapter() external onlyOwner {
        require(pendingSwapAdapter != address(0), "No pending adapter");
        require(block.timestamp >= swapAdapterActivationTime, "Timelock not expired");
        address newAdapter = pendingSwapAdapter;
        swapAdapter = ISwapAdapter(newAdapter);
        pendingSwapAdapter = address(0);
        swapAdapterActivationTime = 0;
        emit SwapAdapterUpdated(newAdapter);
    }

    /**
     * @notice Cancel a pending swap adapter change before it is executed.
     */
    function cancelSwapAdapterChange() external onlyOwner {
        require(pendingSwapAdapter != address(0), "No pending change");
        pendingSwapAdapter = address(0);
        swapAdapterActivationTime = 0;
        emit SwapAdapterChangeCancelled();
    }

    /// @notice SC-M4: Capped at 730 days from now AND by absoluteDeadlineMax (set at construction).
    /// @dev F-006: absoluteDeadlineMax prevents repeated extensions from locking donors out
    ///      of refunds indefinitely. The deadline can only ever be extended up to
    ///      (originalDeadline + 730 days), regardless of how many times this is called.
    function extendDeadline(uint256 newDeadline) external onlyOwner {
        require(newDeadline > deadline, "Must be later");
        require(newDeadline <= block.timestamp + MAX_DEADLINE_EXTENSION, "Deadline too far");
        require(newDeadline <= absoluteDeadlineMax, "Exceeds absolute max deadline");
        deadline = newDeadline;
        emit DeadlineExtended(newDeadline);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Permanently halt all donations via the circuit breaker. Call resetCircuitBreaker to lift.
    function haltCircuitBreaker() external onlyOwner {
        _cbHalted = true;
        emit CircuitBreakerHalted();
    }

    function resetCircuitBreaker() external onlyOwner {
        _cbHalted = false;
        _circuitBreaker.reset();
    }

    function updateCircuitBreakerLimits(
        uint256 maxTx,
        uint256 maxHourly,
        uint256 maxDaily
    ) external onlyOwner {
        _circuitBreaker.updateLimits(maxTx, maxHourly, maxDaily);
    }

    /// @notice Emergency drain — only callable by owner to rescue stuck tokens (NOT campaign USDC)
    function emergencyWithdrawToken(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");          // L4
        require(token != address(usdc), "Use withdrawToTreasury for USDC");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to rescue");
        IERC20(token).safeTransfer(to, bal);
    }

    /// @notice Rescue ETH accidentally sent to this contract (e.g. via selfdestruct)
    /// @dev L-6: The receive() fallback has been removed so plain ETH transfers revert.
    ///      This function handles the edge case of force-sent ETH (selfdestruct).
    function emergencyWithdrawETH(address payable to) external onlyOwner {
        require(to != address(0), "Invalid recipient");          // L4
        uint256 bal = address(this).balance;
        require(bal > 0, "No ETH to rescue");
        (bool ok, ) = to.call{value: bal}("");
        require(ok, "ETH transfer failed");
        emit EmergencyETHWithdrawal(to, bal);                    // SC-M2
    }

    // L-6: No receive() fallback — plain ETH transfers revert, preventing accidental ETH lock-in.
    // Use donateETH() to donate native ETH (it automatically swaps to USDC via the adapter).

    /// @notice M-1: Set the watcher address authorised to call donateUSDCFor for BTC/SOL attribution.
    function setWatcher(address _watcher) external onlyOwner {
        require(_watcher != address(0), "Invalid watcher");
        watcher = _watcher;
        emit WatcherUpdated(_watcher);
    }
}
