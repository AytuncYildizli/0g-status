import { ethers } from "ethers";

async function main() {
  const privateKey = process.env.OG_PRIVATE_KEY;
  const toAddress = "0xa8601CDC813cB20A164334c38A89494e09e2A4b1";
  const amount = "250";

  const testnetRpc = "https://evmrpc-testnet.0g.ai";
  const provider = new ethers.JsonRpcProvider(testnetRpc);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("From:", wallet.address);
  console.log("To:", toAddress);
  console.log("Amount:", amount, "A0GI\n");

  console.log("Sending transaction...");
  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: ethers.parseEther(amount),
  });

  console.log("TX Hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Confirmed! Block:", receipt.blockNumber);

  const newBalance = await provider.getBalance(wallet.address);
  console.log("Your new balance:", ethers.formatEther(newBalance), "A0GI");
}

main().catch(console.error);
