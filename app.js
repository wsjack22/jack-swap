const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${index * 70}ms`;
  observer.observe(item);
});

const SWAP_CONFIG = {
  token: "0x7a2ECB9801089e0BdA27AC0244E3b090Ac26e3Ba",
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  router: "0xd959AbbC4920164A6f2B81487280693ad7DcF8AA",
  quoter: "0x2F6a2ccFc27FD34838D14af667EA9d5aFb3936e8",
  fee: 3000,
  slippageBps: 100,
};

const connectBtn = document.getElementById("connectWallet");
const walletStatus = document.getElementById("walletStatus");
const amountInInput = document.getElementById("amountIn");
const amountOutLabel = document.getElementById("amountOut");
const tokenInLabel = document.getElementById("tokenIn");
const tokenOutLabel = document.getElementById("tokenOut");
const payLabel = document.getElementById("payLabel");
const slippageLabel = document.getElementById("slippage");
const networkStatus = document.getElementById("networkStatus");
const useMaxBtn = document.getElementById("useMax");
const reserveInput = document.getElementById("reserveInput");
const quoteBtn = document.getElementById("quoteBtn");
const swapBtn = document.getElementById("swapBtn");
const hint = document.getElementById("swapHint");
const toggles = Array.from(document.querySelectorAll(".toggle"));

let provider;
let signer;
let currentSide = "buy";
let currentChainId;

const erc20Abi = [
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
];

const quoterAbi = [
  "function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
];

const routerAbi = [
  "function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(bytes[] data) payable returns (bytes[] memory results)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
];

const updateSide = (side) => {
  currentSide = side;
  toggles.forEach((toggle) => {
    toggle.classList.toggle("active", toggle.dataset.side === side);
  });
  if (slippageLabel) {
    slippageLabel.textContent = `${SWAP_CONFIG.slippageBps / 100}%`;
  }
  if (side === "buy") {
    payLabel.textContent = "你支付";
    tokenInLabel.textContent = "ETH";
    tokenOutLabel.textContent = "JACKSHIT";
    hint.textContent = "买入 JACKSHIT，将 ETH 直接换成代币。";
  } else {
    payLabel.textContent = "你支付";
    tokenInLabel.textContent = "JACKSHIT";
    tokenOutLabel.textContent = "ETH";
    hint.textContent = "卖出 JACKSHIT，收到 ETH（通过 WETH 解包）。";
  }
  amountOutLabel.textContent = "-";
};

const ensureWallet = async () => {
  if (!window.ethereum) {
    throw new Error("未检测到钱包（MetaMask）");
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  const address = await signer.getAddress();
  walletStatus.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
  connectBtn.textContent = "Wallet Connected";
  const network = await provider.getNetwork();
  currentChainId = Number(network.chainId);
  updateNetworkStatus();
  return signer;
};

const updateNetworkStatus = () => {
  if (!networkStatus) return;
  if (!currentChainId) {
    networkStatus.textContent = "未检测";
    return;
  }
  if (currentChainId === 1) {
    networkStatus.textContent = "Ethereum Mainnet";
    return;
  }
  networkStatus.textContent = `错误网络: ${currentChainId}`;
};

const ensureMainnet = () => {
  if (currentChainId && currentChainId !== 1) {
    throw new Error("请切换到 Ethereum 主网");
  }
};

const quoteSwap = async () => {
  if (!signer) {
    await ensureWallet();
  }
  ensureMainnet();
  const quoter = new ethers.Contract(SWAP_CONFIG.quoter, quoterAbi, signer);
  const amountIn = amountInInput.value.trim();
  if (!amountIn || Number(amountIn) <= 0) {
    throw new Error("请输入有效数量");
  }
  const amountInWei =
    currentSide === "buy"
      ? ethers.parseEther(amountIn)
      : ethers.parseUnits(amountIn, 18);
  const tokenIn =
    currentSide === "buy" ? SWAP_CONFIG.weth : SWAP_CONFIG.token;
  const tokenOut =
    currentSide === "buy" ? SWAP_CONFIG.token : SWAP_CONFIG.weth;

  const quoted = await quoter.quoteExactInputSingle.staticCall(
    tokenIn,
    tokenOut,
    SWAP_CONFIG.fee,
    amountInWei,
    0
  );
  const formatted =
    currentSide === "buy"
      ? ethers.formatUnits(quoted, 18)
      : ethers.formatEther(quoted);
  amountOutLabel.textContent = Number(formatted).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
  return quoted;
};

const setMaxAmount = async () => {
  if (!signer) {
    await ensureWallet();
  }
  ensureMainnet();
  const address = await signer.getAddress();
  if (currentSide === "buy") {
    const balance = await provider.getBalance(address);
    const reserveValue =
      reserveInput?.value && Number(reserveInput.value) > 0
        ? reserveInput.value
        : "0.001";
    const reserve = ethers.parseEther(reserveValue);
    const usable = balance > reserve ? balance - reserve : 0n;
    amountInInput.value = ethers.formatEther(usable);
  } else {
    const tokenContract = new ethers.Contract(
      SWAP_CONFIG.token,
      erc20Abi,
      signer
    );
    const balance = await tokenContract.balanceOf(address);
    amountInInput.value = ethers.formatUnits(balance, 18);
  }
  amountOutLabel.textContent = "-";
};

const performSwap = async () => {
  if (!signer) {
    await ensureWallet();
  }
  ensureMainnet();
  const amountIn = amountInInput.value.trim();
  if (!amountIn || Number(amountIn) <= 0) {
    throw new Error("请输入有效数量");
  }
  const quoted = await quoteSwap();
  const minOut =
    (quoted * BigInt(10000 - SWAP_CONFIG.slippageBps)) / 10000n;
  const router = new ethers.Contract(SWAP_CONFIG.router, routerAbi, signer);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

  if (currentSide === "buy") {
    const params = {
      tokenIn: SWAP_CONFIG.weth,
      tokenOut: SWAP_CONFIG.token,
      fee: SWAP_CONFIG.fee,
      recipient: await signer.getAddress(),
      deadline,
      amountIn: ethers.parseEther(amountIn),
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0,
    };
    const tx = await router.exactInputSingle(params, {
      value: params.amountIn,
    });
    await tx.wait();
    hint.textContent = "买入完成。";
    return;
  }

  const tokenContract = new ethers.Contract(
    SWAP_CONFIG.token,
    erc20Abi,
    signer
  );
  const balance = await tokenContract.balanceOf(await signer.getAddress());
  const amountInWei = ethers.parseUnits(amountIn, 18);
  if (amountInWei > balance) {
    throw new Error("余额不足");
  }
  const allowance = await tokenContract.allowance(
    await signer.getAddress(),
    SWAP_CONFIG.router
  );
  if (allowance < amountInWei) {
    const approveTx = await tokenContract.approve(
      SWAP_CONFIG.router,
      amountInWei
    );
    await approveTx.wait();
  }

  const params = {
    tokenIn: SWAP_CONFIG.token,
    tokenOut: SWAP_CONFIG.weth,
    fee: SWAP_CONFIG.fee,
    recipient: SWAP_CONFIG.router,
    deadline,
    amountIn: amountInWei,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0,
  };
  const iface = new ethers.Interface(routerAbi);
  const data1 = iface.encodeFunctionData("exactInputSingle", [params]);
  const data2 = iface.encodeFunctionData("unwrapWETH9", [
    minOut,
    await signer.getAddress(),
  ]);
  const tx = await router.multicall([data1, data2]);
  await tx.wait();
  hint.textContent = "卖出完成。";
};

connectBtn?.addEventListener("click", () => {
  ensureWallet().catch((error) => {
    walletStatus.textContent = "连接失败";
    hint.textContent = error.message;
  });
});

if (window.ethereum) {
  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
  window.ethereum.on("accountsChanged", () => {
    window.location.reload();
  });
}

quoteBtn?.addEventListener("click", () => {
  quoteSwap().catch((error) => {
    hint.textContent = error.message;
  });
});

swapBtn?.addEventListener("click", () => {
  performSwap().catch((error) => {
    hint.textContent = error.message;
  });
});

useMaxBtn?.addEventListener("click", () => {
  setMaxAmount().catch((error) => {
    hint.textContent = error.message;
  });
});

toggles.forEach((toggle) => {
  toggle.addEventListener("click", () => updateSide(toggle.dataset.side));
});

updateSide(currentSide);
