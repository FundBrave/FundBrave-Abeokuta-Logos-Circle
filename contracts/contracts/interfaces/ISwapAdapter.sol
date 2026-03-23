// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwapAdapter {
    function swapToUSDT(address tokenIn, uint256 amountIn) external returns (uint256 amountOut);
    function swapNativeToUSDT() external payable returns (uint256 amountOut);
}
