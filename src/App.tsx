// src/App.tsx
import React, { useEffect, useState, useRef } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: ethers.providers.ExternalProvider & {
      on?: (...args: any[]) => void;
      removeListener?: (...args: any[]) => void;
      request?: (...args: any[]) => Promise<any>;
    };
  }
}

const contractAddress = "0x8b53744F48E8FD46773E646c0AF093dd1d02898b";
const contractABI = [
  {
    inputs: [],
    name: "itemCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "items",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "address payable", name: "seller", type: "address" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "bool", name: "sold", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "_name", type: "string" },
      { internalType: "uint256", name: "_price", type: "uint256" },
    ],
    name: "listItem",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_id", type: "uint256" }],
    name: "buyItem",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
];

interface Item {
  id: number;
  seller: string;
  name: string;
  price: string;
  sold: boolean;
}

const App: React.FC = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] =
    useState<ethers.providers.Web3Provider | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [contractBalance, setContractBalance] = useState("0.0");
  const pollRef = useRef<number | null>(null);

  const setupProviderAndContract = async (selectedAccount?: string) => {
    if (!window.ethereum) return;
    const prov = new ethers.providers.Web3Provider(window.ethereum);
    setProvider(prov);
    const signer = prov.getSigner();
    const contractInstance = new ethers.Contract(
      contractAddress,
      contractABI,
      signer
    );
    setContract(contractInstance);
    if (selectedAccount) setAccount(selectedAccount);
    await fetchContractBalance(prov);
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not detected. Please install MetaMask.");
      return;
    }
    try {
      const currentChainId = await window.ethereum.request!({
        method: "eth_chainId",
      });
      if (currentChainId !== "0x1f90") {
        // Liberty 1.X chainId
        try {
          await window.ethereum.request!({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x1f90" }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request!({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x1f90",
                  chainName: "Shardeum Liberty 1.X",
                  nativeCurrency: { name: "SHM", symbol: "SHM", decimals: 18 },
                  rpcUrls: ["https://liberty10.shardeum.org/"],
                  blockExplorerUrls: [
                    "https://explorer-liberty10.shardeum.org/",
                  ],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }
      const accounts: string[] = await window.ethereum.request!({
        method: "eth_requestAccounts",
      });
      if (accounts.length > 0) {
        await setupProviderAndContract(accounts[0]);
        setAccount(accounts[0]);
      }
    } catch (err) {
      console.error("connectWallet error:", err);
      alert("Connection rejected or failed.");
    }
  };

  const fetchContractBalance = async (prov?: ethers.providers.Web3Provider) => {
    try {
      const p = prov || provider;
      if (!p) return;
      const balanceBN = await p.getBalance(contractAddress);
      setContractBalance(
        Number(ethers.utils.formatEther(balanceBN)).toFixed(6)
      );
    } catch (err) {
      console.error("fetchContractBalance error:", err);
    }
  };

  const loadItems = async (contractInstance?: ethers.Contract) => {
    const c = contractInstance || contract;
    if (!c) return;
    setLoading(true);
    try {
      const countBN = await c.itemCount();
      const count = countBN.toNumber();
      const loaded: Item[] = [];
      for (let i = 1; i <= count; i++) {
        const raw = await c.items(i);
        loaded.push({
          id: raw.id.toNumber(),
          seller: raw.seller,
          name: raw.name,
          price: ethers.utils.formatEther(raw.price),
          sold: raw.sold,
        });
      }
      setItems(loaded.reverse());
    } catch (err) {
      console.error("loadItems error:", err);
    } finally {
      setLoading(false);
    }
  };

  const listNewItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!account || !contract) {
      alert("Connect your wallet first");
      return;
    }
    if (!itemName || !itemPrice) {
      alert("Please enter item name and price");
      return;
    }
    try {
      setLoading(true);
      const priceInWei = ethers.utils.parseEther(itemPrice);
      const tx = await contract.listItem(itemName, priceInWei);
      await tx.wait();
      setItemName("");
      setItemPrice("");
      await loadItems(contract);
      await fetchContractBalance();
      alert("Item listed successfully!");
    } catch (err: any) {
      console.error("Error listing item:", err);
      alert("Error listing item: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const buyItem = async (id: number, price: string) => {
    if (!account || !contract) {
      alert("Connect your wallet first");
      return;
    }
    try {
      setLoading(true);
      const tx = await contract.buyItem(id, {
        value: ethers.utils.parseEther(price),
      });
      await tx.wait();
      await loadItems(contract);
      await fetchContractBalance();
      alert("Purchase completed!");
    } catch (err: any) {
      console.error("Error buying item:", err);
      alert("Error buying item: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!window.ethereum) return;
      try {
        const accounts: string[] = await window.ethereum.request!({
          method: "eth_accounts",
        });
        if (!mounted) return;
        if (accounts.length > 0) {
          await setupProviderAndContract(accounts[0]);
          setAccount(accounts[0]);
        }
      } catch (err) {
        console.error("init eth_accounts error:", err);
      }
    }
    init();

    const handleAccountsChanged = async (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setAccount(null);
        setContract(null);
        setItems([]);
        setContractBalance("0.0");
      } else {
        await setupProviderAndContract(accounts[0]);
        setAccount(accounts[0]);
        setTimeout(() => {
          loadItems();
          fetchContractBalance();
        }, 500);
      }
    };
    window.ethereum?.on?.("accountsChanged", handleAccountsChanged);
    return () => {
      mounted = false;
      window.ethereum?.removeListener?.(
        "accountsChanged",
        handleAccountsChanged
      );
    };
  }, []);

  useEffect(() => {
    if (contract) {
      loadItems(contract);
      fetchContractBalance();
    }
  }, [contract]);

  useEffect(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const id = window.setInterval(() => {
      fetchContractBalance();
    }, 12000);
    pollRef.current = id;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [provider]);

  const normalizedAccount = account?.toLowerCase() || "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "40px 20px",
        fontFamily: `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          backgroundColor: "white",
          borderRadius: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          padding: 28,
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: 18, color: "#4a148c" }}>
          Shardeum Marketplace
        </h1>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ margin: 0, color: "#555" }}>Contract balance</p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 18,
                fontWeight: 700,
                color: "#6a1b9a",
              }}
            >
              {contractBalance} SHM
            </p>
          </div>
          <div>
            {!account ? (
              <button
                onClick={connectWallet}
                style={{
                  backgroundColor: "#4a148c",
                  color: "white",
                  padding: "10px 20px",
                  fontSize: 16,
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#6a1b9a")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "#4a148c")
                }
              >
                Connect Wallet
              </button>
            ) : (
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, color: "#555", fontSize: 13 }}>
                  Connected account
                </p>
                <p
                  style={{ margin: "6px 0 0", fontWeight: 700, color: "#333" }}
                >
                  {account.slice(0, 6)}...{account.slice(-4)}
                </p>
              </div>
            )}
          </div>
        </div>
        <form
          onSubmit={listNewItem}
          style={{
            marginTop: 22,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <input
            type="text"
            placeholder="Item name"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            style={{
              padding: 10,
              flexGrow: 1,
              minWidth: 190,
              borderRadius: 6,
              border: "1.5px solid #ccc",
              fontSize: 16,
            }}
            required
          />
          <input
            type="number"
            placeholder="Price in SHM"
            step="0.0001"
            min="0"
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
            style={{
              padding: 10,
              width: 160,
              borderRadius: 6,
              border: "1.5px solid #ccc",
              fontSize: 16,
            }}
            required
          />
          <button
            type="submit"
            disabled={loading || !account || !contract}
            style={{
              backgroundColor:
                loading || !account || !contract ? "#a98ad8" : "#6a1b9a",
              color: "white",
              padding: "10px 18px",
              fontSize: 15,
              borderRadius: 6,
              border: "none",
              cursor:
                loading || !account || !contract ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Processing..." : "List Item"}
          </button>
        </form>
        <h2
          style={{
            marginTop: 28,
            marginBottom: 12,
            color: "#4a148c",
            textAlign: "center",
          }}
        >
          Marketplace Items
        </h2>
        {loading && items.length === 0 && (
          <p style={{ textAlign: "center", color: "#777" }}>Loading items...</p>
        )}
        {!loading && items.length === 0 && (
          <p
            style={{ textAlign: "center", color: "#777", fontStyle: "italic" }}
          >
            No items found.
          </p>
        )}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 18,
            marginTop: 12,
          }}
        >
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                backgroundColor: "#fafafa",
              }}
            >
              <div>
                <strong style={{ fontSize: 17, color: "#4a148c" }}>
                  {item.name}
                </strong>
                <p style={{ margin: "8px 0 0" }}>
                  <span style={{ fontWeight: 700 }}>
                    {Number(item.price).toFixed(6)}
                  </span>{" "}
                  <span style={{ color: "#777" }}>SHM</span>
                </p>
                <p style={{ margin: "8px 0 0", color: "#555", fontSize: 13 }}>
                  Seller:{" "}
                  {item.seller === normalizedAccount
                    ? "You"
                    : shortenAddress(item.seller)}
                </p>
                <p style={{ margin: "6px 0 0" }}>
                  Status:{" "}
                  <span
                    style={{
                      color: item.sold ? "#c62828" : "#2e7d32",
                      fontWeight: 700,
                    }}
                  >
                    {item.sold ? "Sold" : "Available"}
                  </span>
                </p>
              </div>
              <div style={{ marginTop: 12, textAlign: "right" }}>
                {!item.sold &&
                item.seller.toLowerCase() !== normalizedAccount ? (
                  <button
                    onClick={() => buyItem(item.id, item.price)}
                    disabled={loading || !account || !contract}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "none",
                      backgroundColor:
                        loading || !account || !contract ? "#bbb" : "#4a148c",
                      color: "white",
                      cursor:
                        loading || !account || !contract
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Buy
                  </button>
                ) : (
                  <button
                    disabled
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "none",
                      backgroundColor: "#ddd",
                      color: "#666",
                      cursor: "not-allowed",
                    }}
                  >
                    {item.sold
                      ? "Sold"
                      : item.seller.toLowerCase() === normalizedAccount
                      ? "Your Item"
                      : "Unavailable"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

function shortenAddress(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default App;
