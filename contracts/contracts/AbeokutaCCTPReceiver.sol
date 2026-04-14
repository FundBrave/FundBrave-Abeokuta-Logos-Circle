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

interface IMessageTransmitter {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
}

/**
 * @title AbeokutaCCTPReceiver
 * @notice Receives CCTP (Circle's Cross-Chain Transfer Protocol) USDC donations on Base
 *         and credits them to the Abeokuta campaign.
 *
 * Flow:
 *   1. User approves + calls depositForBurn(amount, BASE_DOMAIN=6, thisAddress, sourceUSDC)
 *      on the CCTP TokenMessenger of the source chain (Ethereum/Optimism/Arbitrum).
 *   2. Circle's off-chain attestation service generates an attestation (~2 min L2, ~13 min ETH).
 *   3. Frontend calls completeTransfer(message, attestation, donor) on Base.
 *   4. This contract calls Circle's MessageTransmitter.receiveMessage → USDC minted to this contract.
 *   5. This contract calls campaign.creditDonation(donor, received, chainName).
 *
 * Unlike LayerZero, CCTP requires no pre-funded liquidity pool on Base. USDC is
 * burned on the source chain and natively minted on Base by Circle.
 *
 * @dev The `donor` parameter is passed by the caller (frontend/relayer). Since this is a
 *      donation (no funds flow back to the donor), misattributing a donation doesn't represent
 *      a financial exploit — it only affects the on-chain donor record.
 *
 *      Amount is always verified on-chain by balance delta after receiveMessage — callers
 *      cannot inflate the credited amount.
 *
 *      Replay protection: keccak256(message) is tracked in `processed`.
 */
contract AbeokutaCCTPReceiver is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── CCTP message layout constants ───────────────────────────────────────
    //
    // Message header (116 bytes):
    //   [0:4]    uint32  version
    //   [4:8]    uint32  sourceDomain   ← we read this
    //   [8:12]   uint32  destinationDomain
    //   [12:20]  uint64  nonce
    //   [20:52]  bytes32 sender         (source TokenMessenger)
    //   [52:84]  bytes32 recipient      (dest TokenMessenger)
    //   [84:116] bytes32 destinationCaller
    //
    // BurnMessage body (starts at byte 116):
    //   [116:120] uint32  version
    //   [120:152] bytes32 burnToken
    //   [152:184] bytes32 mintRecipient
    //   [184:216] uint256 amount        ← we read this
    //   [216:248] bytes32 messageSender (original burner)
    //
    // Minimum valid message length: 248 bytes

    uint256 private constant HEADER_LEN      = 116;
    uint256 private constant SOURCE_DOMAIN_OFFSET = 4;
    uint256 private constant AMOUNT_OFFSET   = 184; // 116 + 4 + 32 + 32
    uint256 private constant MIN_MSG_LEN     = 248;

    // ─── CCTP domain IDs ─────────────────────────────────────────────────────

    uint32 public constant DOMAIN_ETHEREUM = 0;
    uint32 public constant DOMAIN_OPTIMISM  = 2;
    uint32 public constant DOMAIN_ARBITRUM  = 3;
    uint32 public constant DOMAIN_BASE      = 6;

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    IAbeokutaCampaign public campaign;
    IMessageTransmitter public immutable messageTransmitter;

    /// @notice Tracks processed transfer hashes (keccak256 of message bytes) for replay protection
    mapping(bytes32 => bool) public processed;

    /// @notice Maps CCTP domain ID → human-readable chain name used in donation records
    mapping(uint32 => string) public domainToChainName;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CCTPDonationReceived(
        address indexed donor,
        uint256 amount,
        uint32  sourceDomain,
        string  chainName,
        bytes32 indexed transferHash
    );
    event CampaignUpdated(address indexed newCampaign);
    event DomainChainNameSet(uint32 indexed domain, string name);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error AlreadyProcessed(bytes32 transferHash);
    error ZeroAmount();
    error InvalidMessage();
    error ReceiveMessageFailed();
    error USDCNotReceived();

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _usdc,
        address _campaign,
        address _messageTransmitter
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        require(_campaign != address(0), "Invalid campaign");
        require(_messageTransmitter != address(0), "Invalid transmitter");

        usdc               = IERC20(_usdc);
        campaign           = IAbeokutaCampaign(_campaign);
        messageTransmitter = IMessageTransmitter(_messageTransmitter);

        // Pre-approve campaign to pull USDC via safeTransferFrom in creditDonation (pull pattern).
        // Matches the same pattern as AbeokutaBridgeReceiver.
        IERC20(_usdc).forceApprove(_campaign, type(uint256).max);

        // Default CCTP domain → chain name mappings
        domainToChainName[DOMAIN_ETHEREUM] = "ethereum";
        domainToChainName[DOMAIN_OPTIMISM]  = "optimism";
        domainToChainName[DOMAIN_ARBITRUM]  = "arbitrum";
        domainToChainName[DOMAIN_BASE]      = "base";
    }

    // ─── Main entry point ────────────────────────────────────────────────────

    /**
     * @notice Complete a CCTP cross-chain USDC donation and credit it to the campaign.
     *
     * @param message     Raw CCTP message bytes (from the MessageSent event on source chain)
     * @param attestation Circle's attestation signature (from iris-api.circle.com)
     * @param donor       Address to credit the donation to (should be the original burner)
     *
     * Steps performed:
     *   1. Deduplicate via keccak256(message)
     *   2. Parse sourceDomain and amount from message bytes
     *   3. Snapshot USDC balance
     *   4. Call MessageTransmitter.receiveMessage → Circle mints USDC to this contract
     *   5. Verify USDC was actually received (balance delta)
     *   6. Call campaign.creditDonation (campaign pulls USDC via pre-approved allowance)
     */
    function completeTransfer(
        bytes calldata message,
        bytes calldata attestation,
        address donor
    ) external nonReentrant whenNotPaused {
        require(donor != address(0), "Invalid donor");

        // Step 1: Replay protection
        bytes32 transferHash = keccak256(message);
        if (processed[transferHash]) revert AlreadyProcessed(transferHash);
        processed[transferHash] = true;

        // Step 2: Parse message — verify structure and extract amount/domain
        (uint32 sourceDomain, uint256 expectedAmount) = _parseMessage(message);
        if (expectedAmount == 0) revert ZeroAmount();

        // Step 3: Snapshot balance before mint
        uint256 balBefore = usdc.balanceOf(address(this));

        // Step 4: Trigger Circle's cross-chain mint
        bool ok = messageTransmitter.receiveMessage(message, attestation);
        if (!ok) revert ReceiveMessageFailed();

        // Step 5: Measure actual received amount (prevents amount manipulation)
        uint256 received = usdc.balanceOf(address(this)) - balBefore;
        if (received == 0) revert USDCNotReceived();

        // Use the actual received amount (not parsed expectedAmount) for crediting,
        // in case of any fee deductions by the CCTP protocol in future versions.
        string memory chainName = _chainName(sourceDomain);
        campaign.creditDonation(donor, received, chainName);

        emit CCTPDonationReceived(donor, received, sourceDomain, chainName, transferHash);
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    /**
     * @dev Parses sourceDomain and amount from a raw CCTP V1 message.
     *      Reverts if the message is too short to contain the expected fields.
     */
    function _parseMessage(bytes calldata message)
        internal
        pure
        returns (uint32 sourceDomain, uint256 amount)
    {
        if (message.length < MIN_MSG_LEN) revert InvalidMessage();

        // sourceDomain is a big-endian uint32 at bytes [4:8]
        sourceDomain = uint32(bytes4(message[SOURCE_DOMAIN_OFFSET : SOURCE_DOMAIN_OFFSET + 4]));

        // amount is a big-endian uint256 at bytes [184:216]
        amount = uint256(bytes32(message[AMOUNT_OFFSET : AMOUNT_OFFSET + 32]));
    }

    function _chainName(uint32 domain) internal view returns (string memory) {
        string memory name = domainToChainName[domain];
        if (bytes(name).length == 0) return "unknown";
        return name;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /**
     * @notice Update the campaign address (e.g. if campaign is redeployed).
     *         Revokes approval from the old campaign and grants it to the new one.
     */
    function setCampaign(address _campaign) external onlyOwner {
        require(_campaign != address(0), "Invalid campaign");
        usdc.forceApprove(address(campaign), 0);
        campaign = IAbeokutaCampaign(_campaign);
        usdc.forceApprove(_campaign, type(uint256).max);
        emit CampaignUpdated(_campaign);
    }

    /**
     * @notice Add or update a CCTP domain → chain name mapping.
     * @dev Used to add new source chains as CCTP expands to more networks.
     */
    function setDomainChainName(uint32 domain, string calldata name) external onlyOwner {
        require(bytes(name).length > 0, "Empty chain name");
        domainToChainName[domain] = name;
        emit DomainChainNameSet(domain, name);
    }

    function pause()   external onlyOwner { _pause();   }
    function unpause() external onlyOwner { _unpause(); }

    /**
     * @notice Rescue stuck tokens (e.g. if a transfer was completed but creditDonation failed).
     */
    function emergencyWithdraw(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to rescue");
        IERC20(token).safeTransfer(to, bal);
    }
}
