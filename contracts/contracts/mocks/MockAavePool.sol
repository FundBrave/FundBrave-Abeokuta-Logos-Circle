// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IAavePool.sol";

/// @dev Test-only aToken — an ERC20 with restricted mint/burn.
contract MockAToken is ERC20 {
    address public pool;

    constructor() ERC20("aUSDC Mock", "aUSDC") {
        pool = msg.sender;
    }

    modifier onlyPool() {
        require(msg.sender == pool, "Only pool");
        _;
    }

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}

/// @dev Test-only Aave pool mock.
///      Tracks supplied amounts and issues/redeems aTokens 1:1.
///      Owner can call simulateYield to mint extra aTokens (simulating interest accrual).
contract MockAavePool is IAavePool {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    MockAToken public aToken;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
        aToken = new MockAToken();
    }

    function supply(address, uint256 amount, address /* onBehalfOf */, uint16) external override {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        aToken.mint(msg.sender, amount); // aTokens go to the supplier (msg.sender), not onBehalfOf for simplicity
    }

    function withdraw(address, uint256 amount, address to) external override returns (uint256) {
        aToken.burn(msg.sender, amount);
        usdc.safeTransfer(to, amount);
        return amount;
    }

    /// @dev Simulates Aave interest accrual.
    ///      The test must also ensure the pool has enough USDC to back the withdrawal.
    function simulateYield(address target, uint256 yieldAmount) external {
        aToken.mint(target, yieldAmount);
    }
}
