import { ethers } from "ethers";

async function main() {
  const privateKey = process.env.OG_PRIVATE_KEY;

  if (!privateKey) {
    console.log("OG_PRIVATE_KEY not set");
    return;
  }

  const wallet = new ethers.Wallet(privateKey);
  console.log("Wallet address:", wallet.address);
  console.log();

  // Check testnet balance
  const testnetRpc = "https://evmrpc-testnet.0g.ai";
  const testnetProvider = new ethers.JsonRpcProvider(testnetRpc);

  try {
    const testnetBalance = await testnetProvider.getBalance(wallet.address);
    console.log("=== 0G TESTNET ===");
    console.log("Balance:", ethers.formatEther(testnetBalance), "A0GI");
    console.log("RPC:", testnetRpc);
  } catch (e) {
    console.log("Testnet error:", e.message);
  }

  // Also check mainnet for comparison
  const mainnetRpc = "https://evmrpc.0g.ai";
  const mainnetProvider = new ethers.JsonRpcProvider(mainnetRpc);

  try {
    const mainnetBalance = await mainnetProvider.getBalance(wallet.address);
    console.log();
    console.log("=== 0G MAINNET ===");
    console.log("Balance:", ethers.formatEther(mainnetBalance), "A0GI");
    console.log("RPC:", mainnetRpc);
  } catch (e) {
    console.log("Mainnet error:", e.message);
  }
}

main();
