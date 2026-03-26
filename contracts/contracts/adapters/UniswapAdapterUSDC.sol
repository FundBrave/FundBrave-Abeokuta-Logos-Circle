// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ISwapAdapter.sol";
import "../interfaces/IUniswapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title UniswapAdapterUSDC
 * @notice Implements ISwapAdapter targeting USDC as the output token.
 *
 * Abeokuta raises funds in USDC (not USDT), so this adapter cannot reuse
 * FundBrave's UniswapAdapter (which targets USDT and uses different function
 * names). This contract mirrors that adapter's logic exactly, substituting
 * USDC for USDT and implementing the `swapToUSDC`/`swapNativeToUSDC` names
 * required by Abeokuta's ISwapAdapter interface.
 *
 * Deployment addresses (Base mainnet):
 *   Uniswap V2 Router:  0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
 *   USDC:               0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 *   WETH:               0x4200000000000000000000000000000000000006
 */
contract UniswapAdapterUSDC is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    // --- Custom Errors ---
    error SlippageTooHigh(uint256 amountOut, uint256 minExpected);
    error InvalidSlippageTolerance();

    IUniswapRouter public immutable uniswapRouter;
    address public immutable USDC;
    address public immutable WETH;

    /// @notice Default slippage tolerance in basis points (500 = 5%)
    uint256 public defaultSlippageBps = 500;

    uint256 public constant MAX_SLIPPAGE_BPS = 1000; // 10% max
    uint256 public constant BPS_DENOMINATOR = 10000;

    event SlippageToleranceUpdated(uint256 oldSlippage, uint256 newSlippage);

    constructor(
        address _router,
        address _usdc,
        address _weth,
        address _owner
    ) Ownable(_owner) {
        uniswapRouter = IUniswapRouter(_router);
        USDC = _usdc;
        WETH = _weth;
    }

    /// @notice Update the default slippage tolerance (owner only).
    function setDefaultSlippage(uint256 _slippageBps) external onlyOwner {
        if (_slippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippageTolerance();
        uint256 old = defaultSlippageBps;
        defaultSlippageBps = _slippageBps;
        emit SlippageToleranceUpdated(old, _slippageBps);
    }

    /**
     * @inheritdoc ISwapAdapter
     * @dev Caller must approve `tokenIn` to this adapter before calling.
     *      If tokenIn == USDC, returns amountIn unchanged (no swap needed).
     */
    function swapToUSDC(address tokenIn, uint256 amountIn)
        external
        override
        returns (uint256 usdcOut)
    {
        // L-1: Short-circuit when input is already USDC.
        // No transfer is performed here — the caller (campaign's donateERC20) has a fast
        // path that handles USDC directly and never reaches this adapter for USDC inputs.
        if (tokenIn == USDC) return amountIn;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(uniswapRouter), amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = USDC;

        uint256[] memory expected = uniswapRouter.getAmountsOut(amountIn, path);
        uint256 amountOutMin = (expected[1] * (BPS_DENOMINATOR - defaultSlippageBps)) / BPS_DENOMINATOR;

        uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            msg.sender,
            block.timestamp + 5 minutes // L-2: 5-minute buffer prevents immediate expiry
        );

        usdcOut = amounts[1];
        if (usdcOut < amountOutMin) revert SlippageTooHigh(usdcOut, amountOutMin);
    }

    /**
     * @inheritdoc ISwapAdapter
     * @dev Swaps native ETH → USDC via WETH. Forwards USDC proceeds to msg.sender.
     */
    function swapNativeToUSDC()
        external
        payable
        override
        returns (uint256 usdcOut)
    {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        uint256[] memory expected = uniswapRouter.getAmountsOut(msg.value, path);
        uint256 amountOutMin = (expected[1] * (BPS_DENOMINATOR - defaultSlippageBps)) / BPS_DENOMINATOR;

        uint256[] memory amounts = uniswapRouter.swapExactETHForTokens{value: msg.value}(
            amountOutMin,
            path,
            msg.sender,
            block.timestamp + 5 minutes // L-2: 5-minute buffer prevents immediate expiry
        );

        usdcOut = amounts[1];
        if (usdcOut < amountOutMin) revert SlippageTooHigh(usdcOut, amountOutMin);
    }
}
