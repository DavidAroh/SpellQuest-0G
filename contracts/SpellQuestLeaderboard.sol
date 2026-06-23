// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * SpellQuestLeaderboard — the on-chain high-score board for SpellQuest AR,
 * deployed on the 0G Galileo testnet (chain id 16602).
 *
 * Each wallet keeps a single best score. Submitting a lower score is a no-op
 * for storage (but still emits an event), so the board can't be griefed and
 * clients can rebuild history from `ScoreSubmitted` logs if they prefer.
 *
 * Deploy with Remix or `contracts/deploy.mjs` — see contracts/DEPLOY.md.
 */
contract SpellQuestLeaderboard {
    struct Entry {
        address player;
        string name;
        uint256 score;
        uint256 timestamp;
    }

    mapping(address => uint256) public bestScore;
    mapping(address => string) public playerName;
    mapping(address => uint256) public lastUpdated;

    address[] private players;
    mapping(address => bool) private known;

    event ScoreSubmitted(address indexed player, string name, uint256 score, uint256 timestamp);

    /// Record a score for the caller. Stores it only if it beats their best.
    function submitScore(string calldata name, uint256 score) external {
        if (!known[msg.sender]) {
            known[msg.sender] = true;
            players.push(msg.sender);
        }
        if (bytes(name).length > 0) {
            playerName[msg.sender] = name;
        }
        if (score > bestScore[msg.sender]) {
            bestScore[msg.sender] = score;
            lastUpdated[msg.sender] = block.timestamp;
        }
        emit ScoreSubmitted(msg.sender, name, score, block.timestamp);
    }

    function playerCount() external view returns (uint256) {
        return players.length;
    }

    /// Full board, unsorted. Clients sort high→low and slice the top N.
    function allEntries() external view returns (Entry[] memory) {
        Entry[] memory list = new Entry[](players.length);
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            list[i] = Entry(p, playerName[p], bestScore[p], lastUpdated[p]);
        }
        return list;
    }
}
