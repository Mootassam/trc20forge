export type NetworkId = "mainnet" | "nile" | "shasta";

export type Network = {
  id: NetworkId;
  /** Chain id used by TronLink's wallet_switchEthereumChain (last 4 bytes of the genesis block hash). */
  chainId: string;
  label: string;
  api: string;
  explorer: string;
  testnet: boolean;
  faucet?: string;
};

export const NETWORKS: Record<NetworkId, Network> = {
  mainnet: { id: "mainnet", chainId: "0x2b6653dc", label: "TRON Mainnet", api: "https://api.trongrid.io", explorer: "https://tronscan.org", testnet: false },
  nile: { id: "nile", chainId: "0xcd8690dc", label: "Nile Testnet", api: "https://nile.trongrid.io", explorer: "https://nile.tronscan.org", testnet: true, faucet: "https://nileex.io/join/getJoinPage" },
  shasta: { id: "shasta", chainId: "0x94a9059e", label: "Shasta Testnet", api: "https://api.shasta.trongrid.io", explorer: "https://shasta.tronscan.org", testnet: true, faucet: "https://shasta.tronex.io" },
};

/** Maps the full-node URL TronLink reports to a known network (null = custom / unknown node). */
export function networkFromHost(host: string | undefined | null): NetworkId | null {
  if (!host) return null;
  const h = host.toLowerCase();
  if (h.includes("nile")) return "nile";
  if (h.includes("shasta")) return "shasta";
  if (h.includes("api.trongrid.io") || h.includes("api.tronstack.io") || h.includes("tronlink") || h.includes("api.tronex.io")) return "mainnet";
  return null;
}

export const explorerTx = (n: NetworkId, txid: string) => `${NETWORKS[n].explorer}/#/transaction/${txid}`;
export const explorerContract = (n: NetworkId, addr: string) => `${NETWORKS[n].explorer}/#/contract/${addr}`;
export const explorerVerify = (n: NetworkId) => `${NETWORKS[n].explorer}/#/contracts/verify`;

/** Base58check TRON address: 'T' + 33 base58 chars. Full checksum is verified by TronWeb in the browser. */
export const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/** Base58 of the zero address; any valid address works as `owner` for a read-only estimate. */
export const ZERO_ADDRESS_BASE58 = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
