// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title NFTAdapter
 * @dev Adapter contract deployed on Chain B for minting NFTs with Filecoin CID metadata
 */
contract NFTAdapter {
    address public trustedRouter;
    uint256 public tokenCounter;
    
    struct NFT {
        address owner;
        string tokenURI; // Filecoin CID
        uint256 mintedAt;
    }
    
    mapping(uint256 => NFT) public nfts;
    mapping(address => uint256[]) public ownerTokens;

    event NFTMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string tokenURI,
        address indexed executor
    );
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);

    modifier onlyRouter() {
        require(msg.sender == trustedRouter, "NFTAdapter: not trusted router");
        _;
    }

    constructor(address _trustedRouter) {
        require(_trustedRouter != address(0), "NFTAdapter: invalid router");
        trustedRouter = _trustedRouter;
    }

    /**
     * @dev Execute from EIL - mint NFT with Filecoin CID
     * @param userAccount The user account that requested the mint
     * @param payload The encoded payload containing CID
     */
    function executeFromEIL(
        address userAccount,
        bytes calldata payload
    ) external onlyRouter {
        require(userAccount != address(0), "NFTAdapter: invalid user account");
        
        // Decode payload: abi.encode(string cid)
        string memory cid = abi.decode(payload, (string));
        require(bytes(cid).length > 0, "NFTAdapter: empty CID");
        
        tokenCounter++;
        uint256 tokenId = tokenCounter;
        
        nfts[tokenId] = NFT({
            owner: userAccount,
            tokenURI: cid,
            mintedAt: block.timestamp
        });
        
        ownerTokens[userAccount].push(tokenId);
        
        emit NFTMinted(tokenId, userAccount, cid, msg.sender);
    }

    /**
     * @dev Get token URI (Filecoin CID)
     * @param tokenId The token ID
     * @return The token URI (CID)
     */
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(nfts[tokenId].owner != address(0), "NFTAdapter: token does not exist");
        return nfts[tokenId].tokenURI;
    }

    /**
     * @dev Get owner of a token
     * @param tokenId The token ID
     * @return The owner address
     */
    function ownerOf(uint256 tokenId) external view returns (address) {
        require(nfts[tokenId].owner != address(0), "NFTAdapter: token does not exist");
        return nfts[tokenId].owner;
    }

    /**
     * @dev Get tokens owned by an address
     * @param owner The owner address
     * @return Array of token IDs
     */
    function tokensOfOwner(address owner) external view returns (uint256[] memory) {
        return ownerTokens[owner];
    }

    /**
     * @dev Update trusted router (only router can update)
     */
    function updateRouter(address newRouter) external onlyRouter {
        require(newRouter != address(0), "NFTAdapter: invalid router");
        address oldRouter = trustedRouter;
        trustedRouter = newRouter;
        emit RouterUpdated(oldRouter, newRouter);
    }
}

