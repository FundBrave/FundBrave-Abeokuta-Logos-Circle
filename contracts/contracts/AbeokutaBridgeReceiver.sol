// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAbeokutaCampaign {
    function creditDonation(
        address donor,
        uint256 amount,
        string calldata sourceChain
    ) external;
}

/**
 * @title AbeokutaBridgeReceiver
 * @notice Destination-side receiver for cross-chain donations arriving via FundBraveBridge.
 *
 * This contract sits on Base and is set as `localFundraiserFactory` on the dedicated
 * Abeokuta FundBraveBridge. When a cross-chain donation arrives via LayerZero V2:
 *
 *   Source chain FundBraveBridge
 *     → LayerZero message
 *       → Base FundBraveBridge._lzReceive
 *         → AbeokutaBridgeReceiver.handleCrossChainDonation (this contract)
 *           → AbeokutaCampaign.creditDonation
 *
 * The `fundraiserId` parameter from the bridge payload is intentionally ignored —
 * there is only one campaign.
 *
 * Replay protection: the bridge itself is stateless regarding replays; LayerZero
 * guarantees exactly-once delivery. We accept this guarantee and keep this contract simple.
 */
contract AbeokutaBridgeReceiver is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    IAbeokutaCampaign public campaign;

    /// @notice Only the FundBraveBridge (on Base) can call the cross-chain handlers
    address public bridge;

    /// @notice Maps LayerZero EID → human-readable chain name for donation records
    mapping(uint32 => string) public eidToChainName;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CrossChainDonationReceived(
        address indexed donor,
        uint256 amount,
        uint32 srcEid,
        string sourceChain
    );
    event BridgeUpdated(address indexed newBridge);
    event CampaignUpdated(address indexed newCampaign);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error OnlyBridge();
    error ZeroAmount();

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _usdc, address _campaign, address _bridge) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        require(_campaign != address(0), "Invalid campaign");

        usdc     = IERC20(_usdc);
        campaign = IAbeokutaCampaign(_campaign);
        bridge   = _bridge;

        // Default EID → chain name mappings (LayerZero V2 EIDs)
        eidToChainName[30101] = "ethereum";
        eidToChainName[30109] = "polygon";
        eidToChainName[30110] = "arbitrum";
        eidToChainName[30111] = "optimism";
        eidToChainName[30184] = "base";
        eidToChainName[30294] = "rootstock";
        eidToChainName[40245] = "base-sepolia";  // testnet
        eidToChainName[40161] = "ethereum-sepolia";
        eidToChainName[40109] = "polygon-amoy";
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyBridge() {
        if (msg.sender != bridge) revert OnlyBridge();
        _;
    }

    // ─── Cross-chain handlers (called by FundBraveBridge) ────────────────────

    /**
     * @notice Handles an incoming cross-chain donation from FundBraveBridge.
     * @dev The bridge transfers USDC to this contract, then calls this function.
     *      The `fundraiserId` parameter is ignored (single-campaign app).
     *      The `messageHash` is for replay protection at the bridge level.
     * @param donor    Original donor address on the source chain
     * @param amount   USDC amount (6 decimals)
     * @param srcEid   LayerZero source endpoint ID (used to look up chain name)
     * The fundraiserId and messageHash parameters are intentionally unnamed — they are
     * required by the ILocalFundraiserFactory interface but unused in this single-campaign app.
     */
    function handleCrossChainDonation(
        address donor,
        uint256 /* fundraiserId */,
        uint256 amount,
        bytes32 /* messageHash */,
        uint32 srcEid
    ) external nonReentrant whenNotPaused onlyBridge {
        if (amount == 0) revert ZeroAmount();

        string memory chainName = _chainName(srcEid);

        // Approve campaign to pull USDC from this contract
        usdc.forceApprove(address(campaign), amount);

        // Forward the donation — campaign will pull USDC via creditDonation
        // Note: creditDonation checks bridge/staking authorization; this contract
        // must be registered via campaign.setStakingPool() or campaign.setBridgeContract()
        campaign.creditDonation(donor, amount, chainName);

        emit CrossChainDonationReceived(donor, amount, srcEid, chainName);
    }

    /**
     * @notice Handles an incoming cross-chain stake (not used for Abeokuta mini, but
     *         required for full bridge interface compatibility).
     */
    function handleCrossChainStake(
        address /* donor */,
        uint256 /* fundraiserId */,
        uint256 /* amount */,
        bytes32 /* messageHash */,
        uint32 /* srcEid */
    ) external onlyBridge {
        // Staking is initiated same-chain only in the mini version.
        // USDC is held in this contract; owner can rescue via emergencyWithdraw.
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _chainName(uint32 eid) internal view returns (string memory) {
        string memory name = eidToChainName[eid];
        if (bytes(name).length == 0) return "unknown";
        return name;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setBridge(address _bridge) external onlyOwner {
        bridge = _bridge;
        emit BridgeUpdated(_bridge);
    }

    function setCampaign(address _campaign) external onlyOwner {
        require(_campaign != address(0), "Invalid");
        campaign = IAbeokutaCampaign(_campaign);
        emit CampaignUpdated(_campaign);
    }

    function setEidChainName(uint32 eid, string calldata name) external onlyOwner {
        eidToChainName[eid] = name;
    }

    function pause() external onlyOwner   { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Rescue stuck tokens (e.g. if a cross-chain stake arrived accidentally)
    function emergencyWithdraw(address token, address to) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to rescue");
        IERC20(token).safeTransfer(to, bal);
    }
}
