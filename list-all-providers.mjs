import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x47340d900bdFec2BD393c626E12ea0656F938d84";

const ABI = [
  "function getAllServices() view returns (tuple(address provider, string serviceType, string url, uint256 inputPrice, uint256 outputPrice, uint256 updatedAt, string model, string verifiability)[])",
  "function listService() view returns (tuple(address provider, string serviceType, string url, uint256 inputPrice, uint256 outputPrice, uint256 updatedAt, string model, string verifiability)[])",
  "function getService(address provider) view returns (tuple(address provider, string serviceType, string url, uint256 inputPrice, uint256 outputPrice, uint256 updatedAt, string model, string verifiability))"
];

async function main() {
  const provider = new ethers.JsonRpcProvider("https://evmrpc.0g.ai");
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // Try getAllServices
  try {
    const services = await contract.getAllServices();
    console.log("getAllServices returned", services.length, "services\n");
    for (const s of services) {
      console.log(s.model, "|", s.url, "|", s.provider.slice(0,10) + "...");
    }
    return;
  } catch (e) {
    console.log("getAllServices failed:", e.message?.slice(0, 50));
  }

  // Try listService
  try {
    const services = await contract.listService();
    console.log("listService returned", services.length, "services\n");
    for (const s of services) {
      console.log(s.model, "|", s.url, "|", s.provider.slice(0,10) + "...");
    }
    return;
  } catch (e) {
    console.log("listService failed:", e.message?.slice(0, 50));
  }

  console.log("\nBoth methods failed - may need different ABI or approach");
}

main();
