/**
 * ============================================================
 *  NovaMind — app.js
 *  BSC 链上 AI 功能平台
 * ============================================================
 *
 *  🔧 ==== 重点配置区域 — 在此修改合约地址和金库地址 ====
 *
 *  修改以下两个地址后，页面所有显示和逻辑（余额查询、
 *  金库追踪、CA展示、BSCScan链接）将自动更新，无需改动其他代码。
 *
 * ============================================================
 */

// ✅ 【重要】代币合约地址 — 请在此处修改为您的实际合约地址
const TOKEN_CONTRACT_ADDRESS = "0x9b8288d678e0db814045b9933e31cb4068f94444";

// ✅ 【重要】🛡 透明公示金库地址 — 请在此处修改为您的金库钱包地址
const TREASURY_WALLET_ADDRESS = "0xD760b9F0F66a388050FcCC1dDAE2157cecD0f710";

// ✅ 持仓解锁门槛（默认 100,000 枚）
const UNLOCK_THRESHOLD = 100000;

// ✅ BSCScan API Key — 请替换为您的真实 BSCScan API Key
// 申请地址: https://bscscan.com/apis
const BSCSCAN_API_KEY = "XGYUT7EWTW93TRSM9MES5QCX4RXXYUVEE8";

// ✅ OpenClaw / Claude AI API Key — 请替换为真实 Anthropic API Key
// 申请地址: https://console.anthropic.com/
const CLAUDE_API_KEY = "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";

// ✅ Replicate API Token — 用于图像修复/视频生成
// 申请地址: https://replicate.com/account/api-tokens
const REPLICATE_API_TOKEN = "r8_57VIUi5sXYShNY0IsqVwOkfzawy4TWz2Q8XMA";

/**
 * ============================================================
 *  以下代码无需修改，所有逻辑基于以上配置自动运行
 * ============================================================
 */

// BSC 链配置
const BSC_CHAIN_ID = "0x38"; // BSC Mainnet = 56 (0x38)
const BSC_CHAIN_CONFIG = {
  chainId: BSC_CHAIN_ID,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
};

// ERC-20 balanceOf ABI (最小化)
const ERC20_ABI = [
  { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" },
  { constant: true, inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], type: "function" },
  { constant: true, inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], type: "function" },
];

// ---- 全局状态 ----
let currentAccount = null;
let tokenBalance = 0;
let isUnlocked = false;
let web3 = null;
let i2vImageBase64 = null;

// ===========================
//  页面初始化
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  renderCABar();
  renderTreasuryAddressDisplay();
  updateBSCScanLink();
  loadTreasuryData();
  checkWalletAlreadyConnected();
});

function renderCABar() {
  const el = document.getElementById("caAddress");
  if (el) el.textContent = TOKEN_CONTRACT_ADDRESS;
}

function copyCA() {
  navigator.clipboard.writeText(TOKEN_CONTRACT_ADDRESS).then(() => {
    const el = document.getElementById("caCopied");
    if (el) { el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2000); }
  });
}

function renderTreasuryAddressDisplay() {
  const el = document.getElementById("treasuryAddressDisplay");
  if (el) el.textContent = TREASURY_WALLET_ADDRESS;
}

function updateBSCScanLink() {
  const link = document.getElementById("bscscanLink");
  if (link) {
    link.href = `https://bscscan.com/address/${TREASURY_WALLET_ADDRESS}`;
  }
}

// ===========================
//  检查是否已连接钱包
// ===========================
async function checkWalletAlreadyConnected() {
  if (typeof window.ethereum === "undefined") return;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts && accounts.length > 0) {
      await onWalletConnected(accounts[0]);
    }
  } catch (e) {
    console.warn("检查钱包状态失败:", e);
  }
}

// ===========================
//  连接钱包
// ===========================
async function connectWallet() {
  if (currentAccount) {
    toggleDisconnectPopup();
    return;
  }

  if (typeof window.ethereum === "undefined") {
    showToast("请安装 MetaMask 或其他 Web3 钱包插件");
    return;
  }

  try {
    showToast("正在请求钱包连接...");

    // 请求账户
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) { showToast("未获取到账户"); return; }

    // 切换/添加 BSC 链
    await switchToBSC();

    await onWalletConnected(accounts[0]);
  } catch (err) {
    console.error("连接钱包失败:", err);
    showToast("连接失败：" + (err.message || "未知错误"));
  }
}

async function switchToBSC() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_CHAIN_ID }],
    });
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [BSC_CHAIN_CONFIG],
      });
    } else {
      throw switchErr;
    }
  }
}

async function onWalletConnected(address) {
  currentAccount = address;

  // 初始化 web3
  if (window.Web3) {
    web3 = new window.Web3(window.ethereum);
  }

  // 更新 UI - 显示地址（截短）
  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
  document.getElementById("walletBtnText").textContent = shortAddr;
  document.querySelector(".wallet-icon").textContent = "●";

  // 查询代币余额
  await refreshTokenBalance();

  // 监听账户切换
  window.ethereum.on("accountsChanged", async (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      await onWalletConnected(accounts[0]);
    }
  });

  showToast("✅ 钱包连接成功，已切换至 BSC 链");
}

// ===========================
//  断开钱包
// ===========================
function disconnectWallet() {
  currentAccount = null;
  tokenBalance = 0;
  isUnlocked = false;

  document.getElementById("walletBtnText").textContent = "连接钱包";
  document.querySelector(".wallet-icon").textContent = "◈";
  document.getElementById("tokenBalanceDisplay").style.display = "none";
  document.getElementById("disconnectPopup").style.display = "none";

  updateFeatureLockUI();
  showToast("已断开钱包连接");
}

function toggleDisconnectPopup() {
  const popup = document.getElementById("disconnectPopup");
  popup.style.display = popup.style.display === "none" ? "block" : "none";
}

// 点击其他地方关闭断开弹窗
document.addEventListener("click", (e) => {
  const popup = document.getElementById("disconnectPopup");
  const walletBtn = document.getElementById("walletBtn");
  if (popup && !popup.contains(e.target) && !walletBtn.contains(e.target)) {
    popup.style.display = "none";
  }
});

// ===========================
//  查询代币余额
// ===========================
async function refreshTokenBalance() {
  if (!currentAccount) return;

  try {
    let balance = 0;

    // 尝试用 Web3 查询
    if (web3 && TOKEN_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      const contract = new web3.eth.Contract(ERC20_ABI, TOKEN_CONTRACT_ADDRESS);
      const [rawBalance, decimals] = await Promise.all([
        contract.methods.balanceOf(currentAccount).call(),
        contract.methods.decimals().call(),
      ]);
      balance = parseFloat(rawBalance) / Math.pow(10, parseInt(decimals));
    } else if (TOKEN_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      // 备用：通过 BSCScan API 查询
      const url = `https://api.bscscan.com/api?module=account&action=tokenbalance&contractaddress=${TOKEN_CONTRACT_ADDRESS}&address=${currentAccount}&tag=latest&apikey=${BSCSCAN_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "1") {
        // 默认 18 位精度
        balance = parseFloat(data.result) / 1e18;
      }
    }

    tokenBalance = balance;
    isUnlocked = tokenBalance >= UNLOCK_THRESHOLD;

    updateBalanceDisplay();
    updateFeatureLockUI();
  } catch (err) {
    console.error("查询余额失败:", err);
    showToast("余额查询失败，请检查网络");
  }
}

function updateBalanceDisplay() {
  const display = document.getElementById("tokenBalanceDisplay");
  const amountEl = document.getElementById("navTokenBalance");

  display.style.display = "flex";
  amountEl.textContent = formatNumber(tokenBalance);
  amountEl.className = "balance-amount " + (tokenBalance >= UNLOCK_THRESHOLD ? "balance-green" : "balance-red");
}

function updateFeatureLockUI() {
  // 只更新功能区标题提示，卡片本身始终正常显示可点击
  const titleEl = document.getElementById("featureLockTitle");
  const subtitleEl = document.getElementById("featureSubtitle");
  if (titleEl && subtitleEl) {
    if (!currentAccount) {
      titleEl.textContent = "🔒 持仓解锁";
      subtitleEl.textContent = "连接钱包并持有 ≥ 100,000 枚代币即可解锁以下功能";
    } else if (isUnlocked) {
      titleEl.textContent = "✅ 已解锁";
      subtitleEl.textContent = `您当前持有 ${formatNumber(tokenBalance)} 枚代币，所有 AI 功能已可使用`;
    } else {
      titleEl.textContent = "🔒 持仓不足";
      subtitleEl.textContent = `您当前持有 ${formatNumber(tokenBalance)} 枚，还需 ${formatNumber(UNLOCK_THRESHOLD - tokenBalance)} 枚方可解锁`;
    }
  }
}

// ===========================
//  功能弹窗 — 卡片点击始终打开弹窗
//  权限检查在用户提交操作时进行
// ===========================
function openFeature(id) {
  // 直接打开弹窗，不做任何拦截
  // 权限检查在 sendOpenClaw / generateT2V / generateI2V / handlePhotoUpload 等提交时进行
  const modal = document.getElementById(`modal-${id}`);
  if (modal) modal.classList.add("open");
}

// 检查是否有使用权限（在用户实际提交操作时调用）
async function checkCanUse() {
  if (!currentAccount) {
    showToast("请先连接钱包才能使用功能");
    return false;
  }
  // 每次使用前实时刷新余额确保准确
  await refreshTokenBalance();
  if (!isUnlocked) {
    showToast(`❌ 持仓不足，需要 ≥ ${formatNumber(UNLOCK_THRESHOLD)} 枚代币（当前持有 ${formatNumber(tokenBalance)} 枚）`);
    return false;
  }
  return true;
}

function closeModal(id) {
  const modal = document.getElementById(`modal-${id}`);
  if (modal) modal.classList.remove("open");
}

// ===========================
//  OpenClaw AI Agent
//  🔧 修改 CLAUDE_API_KEY 启用真实对话
// ===========================
async function sendOpenClaw() {
  const input = document.getElementById("openclawInput");
  const chatArea = document.getElementById("openclawChat");
  const text = input.value.trim();
  if (!text) return;

  // 用户输入后检查权限
  const canUse = await checkCanUse();
  if (!canUse) return;

  // 显示用户消息
  appendChatMsg(chatArea, text, "user");
  input.value = "";

  // 显示 loading
  const loadingMsg = appendChatMsg(chatArea, "⏳ 正在思考...", "assistant");

  try {
    // 🔧 重要：修改 CLAUDE_API_KEY 为真实密钥以启用 AI 对话
    if (CLAUDE_API_KEY === "YourAnthropicAPIKeyHere") {
      await sleep(1200);
      loadingMsg.textContent = simulateOpenClawResponse(text);
      return;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: `你是 NovaMind AI Agent，基于 OpenClaw 框架构建的智能助理。
你运行在 BSC 区块链项目 NovaMind 的官方平台上。
你擅长: AI 任务规划、ReAct 推理、加密市场分析、技术问答。
回复要简洁专业，使用中文，带有 AI Agent 的风格。`,
        messages: [{ role: "user", content: text }],
      }),
    });

    const data = await response.json();
    if (data.content && data.content[0]) {
      loadingMsg.textContent = data.content[0].text;
    } else {
      loadingMsg.textContent = "抱歉，未能获取响应，请检查 API Key 配置。";
    }
  } catch (err) {
    loadingMsg.textContent = "❌ 请求失败: " + err.message;
    console.error("OpenClaw API Error:", err);
  }
  chatArea.scrollTop = chatArea.scrollHeight;
}

function appendChatMsg(container, text, role) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}-msg`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function simulateOpenClawResponse(text) {
  const responses = [
    `[ReAct 思考链]\n→ 分析输入: "${text}"\n→ 检索知识库...\n→ 生成执行计划:\n  Step 1: 解析用户意图\n  Step 2: 调用相关工具\n  Step 3: 整合结果输出\n\n✅ 已处理您的请求。OpenClaw 框架支持最多 32 步工具调用链，当前演示模式已激活。请配置 API Key 以启用真实 AI 推理能力。`,
    `作为 NovaMind AI Agent，我理解您想了解 "${text}"。\n\n基于 OpenClaw 的 ReAct 架构，我会通过以下工具链处理：\n🔍 web_search → 获取最新信息\n📊 data_analysis → 结构化分析\n💡 reasoning → 推理整合\n\n请配置真实 API Key 以体验完整功能。`,
    `[OpenClaw Agent 响应]\n任务: ${text}\n\n执行步骤:\n1. 🧠 意图识别完成\n2. 📡 工具选择: reasoning + knowledge_base\n3. ✨ 生成分析结果...\n\n这是 OpenClaw 框架的演示响应。配置 CLAUDE_API_KEY 后可获得真实的 Claude AI 推理输出。`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// ===========================
//  老照片修复上色
//  🔧 修改 REPLICATE_API_TOKEN 启用真实功能
// ===========================
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    // 用户上传图片后检查权限
    const canUse = await checkCanUse();
    if (!canUse) return;
    const resultArea = document.getElementById("photoResult");
    const originalImg = document.getElementById("photoOriginal");
    const outputDiv = document.getElementById("photoOutput");

    originalImg.src = e.target.result;
    outputDiv.innerHTML = "处理中...";
    outputDiv.className = "result-img-placeholder";
    resultArea.style.display = "block";

    // 🔧 重要：配置 REPLICATE_API_TOKEN 启用真实 API 处理
    processPhotoRestore(e.target.result, outputDiv);
  };
  reader.readAsDataURL(file);
}

async function processPhotoRestore(base64Img, outputDiv) {
  if (REPLICATE_API_TOKEN === "YourReplicateAPITokenHere") {
    await sleep(2000);
    outputDiv.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;padding:20px;text-align:center;">
      🔧 请在 app.js 中配置真实的 REPLICATE_API_TOKEN<br/>
      即可使用 GFPGAN + DeOldify 真实修复上色功能
    </div>`;
    showToast("请配置 Replicate API Token 以启用真实功能");
    return;
  }

  try {
    outputDiv.innerHTML = "🔄 正在调用 GFPGAN 修复...";

    // 调用 Replicate GFPGAN API 进行老照片修复上色
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "9283608cc6b7be6b65a8e44983db012355f829a539ad21ef5669aef44ea1cdc0",
        input: {
          img: base64Img,
          version: "v1.4",
          scale: 2,
          codeformer_fidelity: 0.5,
          face_upsample: true,
          background_enhance: true,
          upscale: 2,
        },
      }),
    });

    const prediction = await response.json();
    if (!prediction.urls) throw new Error("API 调用失败");

    // 轮询结果
    outputDiv.innerHTML = "⏳ AI 修复中，请稍候...";
    const result = await pollReplicateResult(prediction.urls.get);

    if (result.output) {
      outputDiv.innerHTML = `<img src="${Array.isArray(result.output) ? result.output[0] : result.output}" class="result-img" style="width:100%"/>`;
      showToast("✅ 修复上色完成！");
    }
  } catch (err) {
    outputDiv.innerHTML = "❌ 处理失败: " + err.message;
    console.error("Photo restore error:", err);
  }
}

async function downloadPhoto() {
  const img = document.querySelector("#photoResult img");
  if (img) {
    const a = document.createElement("a");
    a.href = img.src;
    a.download = "novamind_restored.jpg";
    a.click();
  }
}

// ===========================
//  文字转视频
//  🔧 修改 REPLICATE_API_TOKEN 启用真实功能
// ===========================
async function generateT2V() {
  const prompt = document.getElementById("t2vPrompt").value.trim();
  if (!prompt) { showToast("请输入视频描述"); return; }

  // 用户填写完提示词后检查权限
  const canUse = await checkCanUse();
  if (!canUse) return;

  const btn = document.getElementById("t2vBtn");
  const status = document.getElementById("t2vStatus");
  const resultArea = document.getElementById("t2vResult");

  btn.disabled = true;
  btn.textContent = "⏳ 生成中...";
  resultArea.style.display = "none";
  status.textContent = "🔄 正在提交生成任务...";

  if (REPLICATE_API_TOKEN === "YourReplicateAPITokenHere") {
    await sleep(2000);
    status.textContent = "🔧 请在 app.js 中配置真实的 REPLICATE_API_TOKEN 以启用视频生成功能（基于 Wan2.1 模型）";
    btn.disabled = false;
    btn.textContent = "🎬 生成视频";
    showToast("请配置 Replicate API Token");
    return;
  }

  try {
    const style = document.getElementById("t2vStyle").value;
    const stylePrompt = { realistic: "photorealistic, 8k", anime: "anime style, vibrant", cinematic: "cinematic, dramatic lighting", fantasy: "fantasy art, magical" }[style];
    const fullPrompt = `${prompt}, ${stylePrompt}`;

    // 🔧 使用 Wan2.1 文字转视频模型
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "d8757a3ab4f7fb68c936cf01c5c7b5a2efccc1b31d89e0e15a90b1e9b9b8a7f1",
        input: {
          prompt: fullPrompt,
          num_frames: parseInt(document.getElementById("t2vDuration").value) * 8,
          fps: 8,
        },
      }),
    });

    const prediction = await response.json();
    if (!prediction.urls) throw new Error("视频生成 API 调用失败");

    status.textContent = "⏳ 视频生成中，预计需要 1-3 分钟...";
    const result = await pollReplicateResult(prediction.urls.get);

    if (result.output) {
      const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      document.getElementById("t2vVideo").src = videoUrl;
      resultArea.style.display = "block";
      status.textContent = "✅ 视频生成完成！";
      showToast("✅ 视频生成成功！");
    }
  } catch (err) {
    status.textContent = "❌ 生成失败: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "🎬 生成视频";
  }
}

// ===========================
//  图片转视频
//  🔧 修改 REPLICATE_API_TOKEN 启用真实功能
// ===========================
function handleI2VUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    i2vImageBase64 = e.target.result;
    const preview = document.getElementById("i2vPreview");
    const previewImg = document.getElementById("i2vPreviewImg");
    previewImg.src = e.target.result;
    preview.style.display = "block";
    document.getElementById("i2vBtn").style.display = "inline-flex";
  };
  reader.readAsDataURL(file);
}

async function generateI2V() {
  if (!i2vImageBase64) { showToast("请先上传图片"); return; }

  // 用户上传图片并点击生成时检查权限
  const canUse = await checkCanUse();
  if (!canUse) return;

  const btn = document.getElementById("i2vBtn");
  const status = document.getElementById("i2vStatus");
  const resultArea = document.getElementById("i2vResult");

  btn.disabled = true;
  btn.textContent = "⏳ 生成中...";
  resultArea.style.display = "none";
  status.textContent = "🔄 正在提交任务...";

  if (REPLICATE_API_TOKEN === "YourReplicateAPITokenHere") {
    await sleep(2000);
    status.textContent = "🔧 请在 app.js 中配置真实的 REPLICATE_API_TOKEN 以启用图片转视频功能（基于 Stable Video Diffusion）";
    btn.disabled = false;
    btn.textContent = "🎬 生成视频";
    showToast("请配置 Replicate API Token");
    return;
  }

  try {
    const motionScale = { low: 64, medium: 127, high: 255 }[document.getElementById("i2vMotion").value];

    // 🔧 使用 Stable Video Diffusion XT 模型
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
        input: {
          input_image: i2vImageBase64,
          motion_bucket_id: motionScale,
          fps_id: 6,
          cond_aug: 0.02,
          decoding_t: 14,
          output_format: "mp4",
        },
      }),
    });

    const prediction = await response.json();
    if (!prediction.urls) throw new Error("API 调用失败");

    status.textContent = "⏳ 视频动态生成中，预计需要 1-2 分钟...";
    const result = await pollReplicateResult(prediction.urls.get);

    if (result.output) {
      const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      document.getElementById("i2vVideo").src = videoUrl;
      resultArea.style.display = "block";
      status.textContent = "✅ 视频生成完成！";
      showToast("✅ 图片动态化成功！");
    }
  } catch (err) {
    status.textContent = "❌ 生成失败: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "🎬 生成视频";
  }
}

function downloadVideo(videoId) {
  const video = document.getElementById(videoId);
  if (video && video.src) {
    const a = document.createElement("a");
    a.href = video.src;
    a.download = "novamind_video.mp4";
    a.click();
  }
}

// ===========================
//  Replicate 轮询
// ===========================
async function pollReplicateResult(url, maxWait = 180000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    await sleep(3000);
    const response = await fetch(url, {
      headers: { "Authorization": `Token ${REPLICATE_API_TOKEN}` },
    });
    const data = await response.json();
    if (data.status === "succeeded") return data;
    if (data.status === "failed") throw new Error("任务执行失败: " + (data.error || "未知"));
  }
  throw new Error("任务超时，请重试");
}

// ===========================
//  🛡 透明公示 — 金库购买记录追踪
//  🔧 修改 BSCSCAN_API_KEY 以获取真实链上数据
// ===========================
async function loadTreasuryData() {
  const tbody = document.getElementById("treasuryTableBody");
  const totalBuysEl = document.getElementById("totalBuys");
  const totalTokensEl = document.getElementById("totalTokensBought");
  const lastBuyEl = document.getElementById("lastBuyTime");
  const holdingEl = document.getElementById("treasuryHolding");

  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="loading-row">⏳ 正在从 BSCScan 获取链上数据...</td></tr>`;

  // 如果是默认占位地址，显示提示
  if (TREASURY_WALLET_ADDRESS === "0x0000000000000000000000000000000000000001" ||
      TOKEN_CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="loading-row">⚙️ 请在 app.js 中配置金库地址和合约地址，即可自动追踪真实链上数据</td></tr>`;
    if (totalBuysEl) totalBuysEl.textContent = "--";
    if (totalTokensEl) totalTokensEl.textContent = "--";
    if (lastBuyEl) lastBuyEl.textContent = "--";
    if (holdingEl) holdingEl.textContent = "--";
    return;
  }

  try {
    // 🔧 从 BSCScan 获取金库地址的代币转入记录（真实购买行为）
    const txUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${TOKEN_CONTRACT_ADDRESS}&address=${TREASURY_WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=desc&apikey=${BSCSCAN_API_KEY}`;

    const [txRes, balRes] = await Promise.all([
      fetch(txUrl).then((r) => r.json()),
      fetch(`https://api.bscscan.com/api?module=account&action=tokenbalance&contractaddress=${TOKEN_CONTRACT_ADDRESS}&address=${TREASURY_WALLET_ADDRESS}&tag=latest&apikey=${BSCSCAN_API_KEY}`).then((r) => r.json()),
    ]);

    // 过滤：只保留金库地址作为接收方（购买行为）
    const buyTxs = (txRes.result || []).filter((tx) =>
      tx.to.toLowerCase() === TREASURY_WALLET_ADDRESS.toLowerCase()
    );

    // 获取当前持仓
    let currentHolding = 0;
    if (balRes.status === "1") {
      currentHolding = parseFloat(balRes.result) / 1e18;
    }

    // 计算总购入
    let totalTokens = 0;
    buyTxs.forEach((tx) => { totalTokens += parseFloat(tx.value) / 1e18; });

    // 更新统计
    if (totalBuysEl) totalBuysEl.textContent = buyTxs.length.toString();
    if (totalTokensEl) totalTokensEl.textContent = formatNumber(totalTokens);
    if (holdingEl) holdingEl.textContent = formatNumber(currentHolding);
    if (lastBuyEl && buyTxs.length > 0) {
      lastBuyEl.textContent = formatTimestamp(parseInt(buyTxs[0].timeStamp));
    }

    // 渲染表格
    if (tbody) {
      if (buyTxs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="loading-row">暂无购买记录</td></tr>`;
      } else {
        tbody.innerHTML = buyTxs.slice(0, 50).map((tx) => {
          const amount = parseFloat(tx.value) / 1e18;
          const shortHash = `${tx.hash.slice(0, 8)}...${tx.hash.slice(-6)}`;
          const bnbValue = tx.gasPrice && tx.gasUsed
            ? (parseFloat(tx.gasPrice) * parseFloat(tx.gasUsed) / 1e18).toFixed(6)
            : "N/A";
          return `
          <tr>
            <td>${formatTimestamp(parseInt(tx.timeStamp))}</td>
            <td><a class="tx-link" href="https://bscscan.com/tx/${tx.hash}" target="_blank">${shortHash} ↗</a></td>
            <td class="amount-positive">+${formatNumber(amount)}</td>
            <td>${bnbValue} BNB</td>
            <td>${tx.blockNumber}</td>
          </tr>`;
        }).join("");
      }
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="loading-row">❌ 加载失败: ${err.message}<br/>请检查 BSCScan API Key 配置</td></tr>`;
    console.error("Treasury load error:", err);
  }
}

// ===========================
//  工具函数
// ===========================
function formatNumber(num) {
  if (!num || isNaN(num)) return "0";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return num.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  return num.toFixed(2);
}

function formatTimestamp(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
