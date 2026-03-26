// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ISwapAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @dev Test-only swap adapter with realistic decimal conversion.
 *
 * ETH (18 dec) → USDC (6 dec) at mock rate of $2000/ETH:
 *   usdcOut = msg.value * 2000 / 1e12
 *   e.g. 0.005 ETH = 5e15 wei → 5e15 * 2000 / 1e12 = 10_000_000 (= $10 USDC) ✓
 *
 * ERC20 18-dec tokens → USDC (scale 18→6 decimals, 1:1 USD mock rate):
 *   usdcOut = amountIn / 1e12
 *   e.g. 10 DAI (1e19) → 10_000_000 (= $10 USDC) ✓
 */
contract MockSwapAdapter is ISwapAdapter {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public immutable weth;
    uint256 public constant MOCK_ETH_PRICE_USD = 2000;

    constructor(address _usdc, address _weth) {
        usdc = IERC20(_usdc);
        weth = _weth;
    }

    function swapToUSDC(address tokenIn, uint256 amountIn)
        external
        override
        returns (uint256 usdcOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        if (tokenIn == weth) {
            // WETH 18-dec: apply $2000/ETH mock rate (0.005 WETH → $10 USDC)
            usdcOut = amountIn * MOCK_ETH_PRICE_USD / 1e12;
        } else if (amountIn >= 1e12) {
            // 18-decimal ERC20: scale 18 dec → 6 dec at 1:1 USD
            usdcOut = amountIn / 1e12;
        } else {
            // 6-decimal ERC20 (USDC-like) or small amounts: pass through 1:1
            // This preserves test compatibility where amounts are already in 6-dec units.
            usdcOut = amountIn;
        }
        require(usdcOut > 0, "Amount too small");
        usdc.safeTransfer(msg.sender, usdcOut);
    }

    function swapNativeToUSDC() external payable override returns (uint256 usdcOut) {
        if (msg.value >= 1e12) {
            // Realistic ETH amounts: apply $2000/ETH mock rate
            usdcOut = msg.value * MOCK_ETH_PRICE_USD / 1e12;
        } else {
            // Small wei amounts: pass through 1:1 for test compatibility
            // (tests use wei values that represent USDC units directly)
            usdcOut = msg.value;
        }
        require(usdcOut > 0, "Amount too small");
        usdc.safeTransfer(msg.sender, usdcOut);
    }

    /// @dev Fund the mock adapter with USDC so swaps can succeed in tests
    function fund(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }
}
