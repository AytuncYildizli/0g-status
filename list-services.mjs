import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x47340d900bdFec2BD393c626E12ea0656F938d84";

const ABI = [
  "function getAllServices(uint256 offset, uint256 limit) view returns (tuple(address provider, string serviceType, string url, uint256 inputPrice, uint256 outputPrice, uint256 updatedAt, string model, string verifiability)[])",
  "function getServiceCount() view returns (uint256)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider("https://evmrpc.0g.ai");
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  try {
    // Try to get total count first
    let totalCount = 0;
    try {
      totalCount = await contract.getServiceCount();
      console.log("Total service count from contract:", totalCount.toString());
    } catch (e) {
      console.log("getServiceCount not available, will paginate manually");
    }

    // Paginate through all services
    let allServices = [];
    let offset = 0;
    const limit = 10;

    while (true) {
      const services = await contract.getAllServices(offset, limit);
      console.log(`Offset ${offset}: got ${services.length} services`);

      if (services.length === 0) break;

      allServices = allServices.concat(services);
      offset += limit;

      if (services.length < limit) break; // Last page
    }

    console.log("\nTotal services found:", allServices.length, "\n");

    // Group by model to find duplicates
    const byModel = {};
    for (const s of allServices) {
      if (!byModel[s.model]) byModel[s.model] = [];
      byModel[s.model].push({
        url: s.url,
        provider: s.provider,
        type: s.serviceType
      });
    }

    console.log("=== Services by Model ===\n");
    for (const [model, providers] of Object.entries(byModel)) {
      const multi = providers.length > 1 ? " ⚠️ MULTIPLE PROVIDERS!" : "";
      console.log(`${model} (${providers.length} provider${providers.length > 1 ? 's' : ''})${multi}`);
      for (const p of providers) {
        console.log(`  - ${p.url}`);
        console.log(`    ${p.provider}`);
      }
      console.log();
    }

  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
