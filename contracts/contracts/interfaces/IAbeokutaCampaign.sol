// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAbeokutaCampaign {
    function creditDonation(
        address donor,
        uint256 amount,
        string calldata sourceChain
    ) external;

    /// @notice Returns true if the campaign deadline has not yet passed
    function isActive() external view returns (bool);
}
