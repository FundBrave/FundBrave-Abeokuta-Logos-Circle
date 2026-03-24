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
    event UnsupportedStakeReceived(address indexed donor, uint256 amount, uint32 srcEid);
    /// @notice SC-M1: Emitted when an EID→chain name mapping is added or updated
    event EidChainNameSet(uint32 indexed eid, string name);

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

        // Approve campaign to pull USDC via safeTransferFrom in creditDonation (pull pattern, M1).
        // When setCampaign changes the campaign address, this approval is revoked and re-granted.
        IERC20(_usdc).approve(_campaign, type(uint256).max);

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
     * @dev The bridge transfers USDC to this receiver, then calls this function.
     *      creditDonation then pulls the USDC from this contract into the campaign
     *      via safeTransferFrom (this contract pre-approves the campaign in the constructor).
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

        // M1: Campaign pulls USDC from this contract via safeTransferFrom (approval set in constructor).
        // No pre-transfer needed — the pull is atomic inside creditDonation.
        campaign.creditDonation(donor, amount, chainName);

        emit CrossChainDonationReceived(donor, amount, srcEid, chainName);
    }

    /**
     * @notice Handles an incoming cross-chain stake (not used for Abeokuta mini, but
     *         required for full bridge interface compatibility).
     */
    function handleCrossChainStake(
        address donor,
        uint256 /* fundraiserId */,
        uint256 amount,
        bytes32 /* messageHash */,
        uint32 srcEid
    ) external nonReentrant whenNotPaused onlyBridge {
        // Staking is initiated same-chain only in the mini version.
        // USDC is held in this contract; owner can rescue via emergencyWithdraw.
        emit UnsupportedStakeReceived(donor, amount, srcEid);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /**
     * @dev SC-L3: Resolves a LayerZero EID to a human-readable chain name for donation records.
     *      Returns "unknown" if the EID has no registered mapping, so the donation is still
     *      recorded rather than silently dropped.
     */
    function _chainName(uint32 eid) internal view returns (string memory) {
        string memory name = eidToChainName[eid];
        if (bytes(name).length == 0) return "unknown";
        return name;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setBridge(address _bridge) external onlyOwner {
        require(_bridge != address(0), "Invalid bridge");
        bridge = _bridge;
        emit BridgeUpdated(_bridge);
    }

    function setCampaign(address _campaign) external onlyOwner {
        require(_campaign != address(0), "Invalid");
        // Revoke pull approval from old campaign, grant to new one
        usdc.forceApprove(address(campaign), 0);
        campaign = IAbeokutaCampaign(_campaign);
        usdc.forceApprove(_campaign, type(uint256).max);
        emit CampaignUpdated(_campaign);
    }

    /// @notice SC-M1: Add or update an EID → chain name mapping.
    ///         Rejects empty strings to prevent unmapped EIDs being silently overwritten with "".
    function setEidChainName(uint32 eid, string calldata name) external onlyOwner {
        require(bytes(name).length > 0, "Empty chain name");
        eidToChainName[eid] = name;
        emit EidChainNameSet(eid, name);
    }

    function pause() external onlyOwner   { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Rescue stuck tokens (e.g. if a cross-chain stake arrived accidentally)
    function emergencyWithdraw(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to rescue");
        IERC20(token).safeTransfer(to, bal);
    }
}
