// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ISwapAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Test-only swap adapter that swaps any token 1:1 with USDC (ignores decimals).
contract MockSwapAdapter is ISwapAdapter {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function swapToUSDC(address tokenIn, uint256 amountIn)
        external
        override
        returns (uint256)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        // 1:1 mock — use pre-funded balance
        usdc.safeTransfer(msg.sender, amountIn);
        return amountIn;
    }

    function swapNativeToUSDC() external payable override returns (uint256) {
        // 1:1 mock: 1 wei ETH = 1 USDC unit (test only)
        usdc.safeTransfer(msg.sender, msg.value);
        return msg.value;
    }

    /// @dev Fund the mock adapter with USDC so swaps can succeed in tests
    function fund(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }
}
