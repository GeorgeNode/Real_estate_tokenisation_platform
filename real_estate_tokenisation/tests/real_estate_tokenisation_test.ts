import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

const CONTRACT_NAME = 'real_estate_tokenization';

Clarinet.test({
    name: "Ensure that contract owner can add new properties",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;

        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1000000), // price: 1M microSTX
                types.ascii("123 Main St, NYC"),
                types.ascii("apartment"),
                types.uint(1200), // area in sq ft
                types.ascii("Beautiful 2BR apartment in Manhattan")
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u0)');

        // Verify property was added correctly
        let propertyQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-property', [types.uint(0)], deployer.address);
        assertEquals(propertyQuery.result.includes('owner: ' + deployer.address), true);
        assertEquals(propertyQuery.result.includes('price: u1000000'), true);
    },
});

Clarinet.test({
    name: "Ensure that only contract owner can add properties",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(500000),
                types.ascii("456 Oak Ave"),
                types.ascii("house"),
                types.uint(2000),
                types.ascii("Spacious family home")
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
    },
});

Clarinet.test({
    name: "Ensure that property owner can update property details",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;

        // First add a property
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(800000),
                types.ascii("789 Pine St"),
                types.ascii("condo"),
                types.uint(900),
                types.ascii("Modern condo")
            ], deployer.address)
        ]);

        // Then update it
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'update-property', [
                types.uint(0), // property-id
                types.uint(850000), // new price
                types.bool(true), // for-sale
                types.ascii("Updated modern condo with new fixtures")
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');
    },
});

Clarinet.test({
    name: "Ensure that non-owners cannot update properties",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Add property as deployer
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(600000),
                types.ascii("321 Elm St"),
                types.ascii("townhouse"),
                types.uint(1500),
                types.ascii("Nice townhouse")
            ], deployer.address)
        ]);

        // Try to update as wallet1
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'update-property', [
                types.uint(0),
                types.uint(700000),
                types.bool(true),
                types.ascii("Unauthorized update")
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that property can be tokenized by owner",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;

        // Add property
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1000000),
                types.ascii("555 Investment Ave"),
                types.ascii("commercial"),
                types.uint(5000),
                types.ascii("Prime commercial property")
            ], deployer.address)
        ]);

        // Tokenize property
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0), // property-id
                types.uint(1000), // total tokens
                types.uint(1000) // price per token (1000 microSTX)
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify tokenization
        let tokenQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-property-tokens', [types.uint(0)], deployer.address);
        assertEquals(tokenQuery.result.includes('total-supply: u1000'), true);
        assertEquals(tokenQuery.result.includes('tokens-remaining: u1000'), true);
    },
});

Clarinet.test({
    name: "Ensure that property cannot be tokenized twice",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;

        // Add and tokenize property
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(2000000),
                types.ascii("777 Luxury Blvd"),
                types.ascii("mansion"),
                types.uint(8000),
                types.ascii("Luxury mansion")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(2000),
                types.uint(1000)
            ], deployer.address)
        ]);

        // Try to tokenize again
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(1500),
                types.uint(1200)
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u103)'); // err-already-tokenized
    },
});

Clarinet.test({
    name: "Ensure that users can buy property tokens",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Add and tokenize property
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1500000),
                types.ascii("888 Token St"),
                types.ascii("office"),
                types.uint(3000),
                types.ascii("Modern office building")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(1500),
                types.uint(1000)
            ], deployer.address)
        ]);

        // Buy tokens
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0), // property-id
                types.uint(100) // token amount
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify token ownership
        let balanceQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet1.address)
        ], wallet1.address);
        assertEquals(balanceQuery.result.includes('token-count: u100'), true);
    },
});

Clarinet.test({
    name: "Ensure that buying more tokens than available fails",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Add and tokenize property with limited tokens
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(500000),
                types.ascii("999 Limited Ave"),
                types.ascii("studio"),
                types.uint(500),
                types.ascii("Small studio apartment")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(50), // only 50 tokens
                types.uint(10000)
            ], deployer.address)
        ]);

        // Try to buy more tokens than available
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(100) // trying to buy 100 when only 50 exist
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u104)'); // err-insufficient-tokens
    },
});

Clarinet.test({
    name: "Ensure that users can buy entire non-tokenized properties",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Add property and set for sale
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(750000),
                types.ascii("111 Sale St"),
                types.ascii("house"),
                types.uint(1800),
                types.ascii("House for sale")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'update-property', [
                types.uint(0),
                types.uint(750000),
                types.bool(true), // for-sale
                types.ascii("House for sale")
            ], deployer.address)
        ]);

        // Buy the property
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-property', [
                types.uint(0)
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify ownership changed
        let propertyQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-property', [types.uint(0)], wallet1.address);
        assertEquals(propertyQuery.result.includes('owner: ' + wallet1.address), true);
    },
});

Clarinet.test({
    name: "Ensure that buying properties not for sale fails",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Add property but don't set for sale
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(600000),
                types.ascii("222 No Sale St"),
                types.ascii("condo"),
                types.uint(1000),
                types.ascii("Not for sale")
            ], deployer.address)
        ]);

        // Try to buy
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-property', [
                types.uint(0)
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u108)'); // err-property-not-for-sale
    },
});

Clarinet.test({
    name: "Ensure that users can create token listings",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Setup: Add property, tokenize, and buy tokens
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1200000),
                types.ascii("333 Market St"),
                types.ascii("retail"),
                types.uint(2500),
                types.ascii("Retail space")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(1200),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(50)
            ], wallet1.address)
        ]);

        // Create listing
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0), // property-id
                types.uint(25), // token amount
                types.uint(1100) // price per token
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u0)'); // listing-id 0

        // Verify listing
        let listingQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-listing', [types.uint(0)], wallet1.address);
        assertEquals(listingQuery.result.includes('active: true'), true);
        assertEquals(listingQuery.result.includes('token-amount: u25'), true);
    },
});

Clarinet.test({
    name: "Ensure that users can buy from token listings",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;

        // Setup: Add property, tokenize, buy tokens, create listing
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1000000),
                types.ascii("444 Exchange Ave"),
                types.ascii("mixed"),
                types.uint(4000),
                types.ascii("Mixed use building")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(1000),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(100)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(30),
                types.uint(1200)
            ], wallet1.address)
        ]);

        // Buy from listing
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-listed-tokens', [
                types.uint(0) // listing-id
            ], wallet2.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify token transfer
        let wallet2Balance = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet2.address)
        ], wallet2.address);
        assertEquals(wallet2Balance.result.includes('token-count: u30'), true);

        let wallet1Balance = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet1.address)
        ], wallet1.address);
        assertEquals(wallet1Balance.result.includes('token-count: u70'), true);
    },
});

Clarinet.test({
    name: "Ensure that users can cancel their token listings",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Setup: Add property, tokenize, buy tokens, create listing
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(800000),
                types.ascii("555 Cancel St"),
                types.ascii("warehouse"),
                types.uint(10000),
                types.ascii("Large warehouse")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(800),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(50)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(20),
                types.uint(1500)
            ], wallet1.address)
        ]);

        // Cancel listing
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'cancel-token-listing', [
                types.uint(0) // listing-id
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify listing is inactive
        let listingQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-listing', [types.uint(0)], wallet1.address);
        assertEquals(listingQuery.result.includes('active: false'), true);
    },
});

Clarinet.test({
    name: "Ensure that users can transfer tokens directly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;

        // Setup: Add property, tokenize, buy tokens
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(900000),
                types.ascii("666 Transfer Ave"),
                types.ascii("loft"),
                types.uint(1500),
                types.ascii("Industrial loft")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(900),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(80)
            ], wallet1.address)
        ]);

        // Transfer tokens
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'transfer-tokens', [
                types.uint(0), // property-id
                types.uint(30), // token amount
                types.principal(wallet2.address) // recipient
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify balances
        let wallet1Balance = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet1.address)
        ], wallet1.address);
        assertEquals(wallet1Balance.result.includes('token-count: u50'), true);

        let wallet2Balance = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet2.address)
        ], wallet2.address);
        assertEquals(wallet2Balance.result.includes('token-count: u30'), true);
    },
});

Clarinet.test({

    name: "Ensure that contract can be paused by owner",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'set-contract-pause', [
                types.bool(true)
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Try to add property while paused
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(500000),
                types.ascii("777 Paused St"),
                types.ascii("studio"),
                types.uint(400),
                types.ascii("Should fail")
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that only owner can pause contract",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'set-contract-pause', [
                types.bool(true)
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
    },
});

Clarinet.test({
    name: "Ensure that platform fees are calculated correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Add and tokenize property
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1000000),
                types.ascii("888 Fee Test St"),
                types.ascii("office"),
                types.uint(2000),
                types.ascii("Fee calculation test")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(1000),
                types.uint(1000) // 1000 microSTX per token
            ], deployer.address)
        ]);

        // Buy tokens (should generate platform fee)
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(100) // 100 tokens = 100,000 microSTX + 2.5% fee = 2,500 microSTX fee
            ], wallet1.address)
        ]);

        // Check contract stats for platform revenue
        let statsQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-contract-stats', [], deployer.address);
        assertEquals(statsQuery.result.includes('platform-revenue: u2500'), true); // 2.5% of 100,000
    },
});

Clarinet.test({
    name: "Ensure that owner can withdraw platform fees",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Generate some platform revenue first
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(2000000),
                types.ascii("999 Withdraw Test Ave"),
                types.ascii("penthouse"),
                types.uint(5000),
                types.ascii("Luxury penthouse")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(2000),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(200) // Generates 5000 microSTX in fees
            ], wallet1.address)
        ]);

        // Withdraw platform fees
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'withdraw-platform-fees', [
                types.uint(3000) // Withdraw 3000 out of 5000
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify remaining platform revenue
        let statsQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-contract-stats', [], deployer.address);
        assertEquals(statsQuery.result.includes('platform-revenue: u2000'), true); // 5000 - 3000 = 2000
    },
});

Clarinet.test({
    name: "Ensure that contract stats are updated correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Initial stats should be zero
        let statsQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-contract-stats', [], deployer.address);
        assertEquals(statsQuery.result.includes('total-properties: u0'), true);
        assertEquals(statsQuery.result.includes('total-listings: u0'), true);

        // Add properties and create listings
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(500000),
                types.ascii("Stats Test 1"),
                types.ascii("condo"),
                types.uint(800),
                types.ascii("First test property")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(750000),
                types.ascii("Stats Test 2"),
                types.ascii("house"),
                types.uint(1200),
                types.ascii("Second test property")
            ], deployer.address)
        ]);

        // Tokenize and create listing
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(500),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(50)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(25),
                types.uint(1200)
            ], wallet1.address)
        ]);

        // Check updated stats
        statsQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-contract-stats', [], deployer.address);
        assertEquals(statsQuery.result.includes('total-properties: u2'), true);
        assertEquals(statsQuery.result.includes('total-listings: u1'), true);
        assertEquals(statsQuery.result.includes('total-transactions: u2'), true); // MINT and LISTING
    },
});

Clarinet.test({
    name: "Ensure that invalid inputs are rejected",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;

        // Try to add property with zero price
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(0), // Invalid: zero price
                types.ascii("Invalid Property"),
                types.ascii("test"),
                types.uint(1000),
                types.ascii("Should fail")
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u109)'); // err-invalid-price

        // Add valid property first
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(500000),
                types.ascii("Valid Property"),
                types.ascii("test"),
                types.uint(1000),
                types.ascii("Valid property")
            ], deployer.address)
        ]);

        // Try to tokenize with zero tokens
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(0), // Invalid: zero tokens
                types.uint(1000)
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u107)'); // err-invalid-token-amount
    },
});

Clarinet.test({
    name: "Ensure that non-existent properties cannot be accessed",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Try to update non-existent property
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'update-property', [
                types.uint(999), // Non-existent property
                types.uint(100000),
                types.bool(true),
                types.ascii("Should fail")
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u101)'); // err-not-found

        // Try to tokenize non-existent property
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(999),
                types.uint(1000),
                types.uint(1000)
            ], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u101)'); // err-not-found

        // Try to buy tokens from non-existent property
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(999),
                types.uint(10)
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u101)'); // err-not-found
    },
});

Clarinet.test({
    name: "Ensure that users cannot buy tokens from non-tokenized properties",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Add property but don't tokenize
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(800000),
                types.ascii("Non-tokenized Property"),
                types.ascii("house"),
                types.uint(1500),
                types.ascii("Regular property")
            ], deployer.address)
        ]);

        // Try to buy tokens
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(50)
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u105)'); // err-not-tokenized
    },
});

Clarinet.test({
    name: "Ensure that users cannot create listings without sufficient tokens",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Setup: Add property, tokenize, buy small amount of tokens
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1000000),
                types.ascii("Insufficient Tokens Test"),
                types.ascii("office"),
                types.uint(2000),
                types.ascii("Test property")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(1000),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(10) // Only buy 10 tokens
            ], wallet1.address)
        ]);

        // Try to create listing for more tokens than owned
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(50), // Try to list 50 tokens when only have 10
                types.uint(1200)
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u104)'); // err-insufficient-tokens
    },
});

Clarinet.test({
    name: "Ensure that users cannot transfer more tokens than they own",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;

        // Setup: Add property, tokenize, buy tokens
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(600000),
                types.ascii("Transfer Limit Test"),
                types.ascii("condo"),
                types.uint(900),
                types.ascii("Test condo")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(600),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(20) // Only own 20 tokens
            ], wallet1.address)
        ]);

        // Try to transfer more than owned
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'transfer-tokens', [
                types.uint(0),
                types.uint(50), // Try to transfer 50 when only have 20
                types.principal(wallet2.address)
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u104)'); // err-insufficient-tokens
    },
});

Clarinet.test({
    name: "Ensure that users cannot cancel other users' listings",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;

        // Setup: Create a listing by wallet1
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(700000),
                types.ascii("Cancel Test Property"),
                types.ascii("townhouse"),
                types.uint(1400),
                types.ascii("Test townhouse")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(700),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(40)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(20),
                types.uint(1100)
            ], wallet1.address)
        ]);

        // Try to cancel listing as different user
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'cancel-token-listing', [
                types.uint(0) // listing created by wallet1
            ], wallet2.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that users cannot buy from inactive listings",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;

        // Setup: Create and cancel a listing
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(550000),
                types.ascii("Inactive Listing Test"),
                types.ascii("studio"),
                types.uint(600),
                types.ascii("Small studio")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(550),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(30)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(15),
                types.uint(1300)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'cancel-token-listing', [
                types.uint(0)
            ], wallet1.address)
        ]);

        // Try to buy from cancelled listing
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-listed-tokens', [
                types.uint(0)
            ], wallet2.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u111)'); // err-listing-not-found
    },
});

Clarinet.test({
    name: "Ensure that users cannot buy their own listings",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Setup: Create a listing
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(400000),
                types.ascii("Self Buy Test"),
                types.ascii("loft"),
                types.uint(800),
                types.ascii("Industrial loft")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(400),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(25)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(10),
                types.uint(1400)
            ], wallet1.address)
        ]);

        // Try to buy own listing
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-listed-tokens', [
                types.uint(0)
            ], wallet1.address) // Same user who created the listing
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that users cannot transfer tokens to themselves",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Setup: Buy some tokens
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(300000),
                types.ascii("Self Transfer Test"),
                types.ascii("apartment"),
                types.uint(700),
                types.ascii("Small apartment")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(300),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(15)
            ], wallet1.address)
        ]);

        // Try to transfer to self
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'transfer-tokens', [
                types.uint(0),
                types.uint(5),
                types.principal(wallet1.address) // Transfer to self
            ], wallet1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that read-only functions return correct data",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        // Setup: Add property and perform various operations
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1100000),
                types.ascii("Read Only Test Property"),
                types.ascii("penthouse"),
                types.uint(3000),
                types.ascii("Luxury penthouse for testing")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0),
                types.uint(1100),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(75)
            ], wallet1.address)
        ]);

        // Test get-property
        let propertyQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-property', [types.uint(0)], deployer.address);
        assertEquals(propertyQuery.result.includes('price: u1100000'), true);
        assertEquals(propertyQuery.result.includes('tokenized: true'), true);
        assertEquals(propertyQuery.result.includes('property-type: "penthouse"'), true);

        // Test get-property-tokens
        let tokensQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-property-tokens', [types.uint(0)], deployer.address);
        assertEquals(tokensQuery.result.includes('total-supply: u1100'), true);
        assertEquals(tokensQuery.result.includes('tokens-remaining: u1025'), true); // 1100 - 75 = 1025

        // Test get-token-balance
        let balanceQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet1.address)
        ], wallet1.address);
        assertEquals(balanceQuery.result.includes('token-count: u75'), true);

        // Test get-user-properties for deployer
        let userPropsQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-user-properties', [
            types.principal(deployer.address)
        ], deployer.address);
        assertEquals(userPropsQuery.result.includes('u0'), true); // Should contain property ID 0
    },
});

Clarinet.test({
    name: "Ensure complex workflow with multiple users and properties works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;
        const wallet3 = accounts.get('wallet_3')!;

        // Step 1: Add multiple properties
        let block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(1500000),
                types.ascii("Complex Test Property 1"),
                types.ascii("commercial"),
                types.uint(4000),
                types.ascii("Large commercial building")
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'add-property', [
                types.uint(800000),
                types.ascii("Complex Test Property 2"),
                types.ascii("residential"),
                types.uint(1200),
                types.ascii("Family home")
            ], deployer.address)
        ]);

        // Step 2: Tokenize first property, set second for sale
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'tokenize-property', [
                types.uint(0), // First property
                types.uint(1500),
                types.uint(1000)
            ], deployer.address),
            Tx.contractCall(CONTRACT_NAME, 'update-property', [
                types.uint(1), // Second property
                types.uint(800000),
                types.bool(true), // for-sale
                types.ascii("Updated family home for sale")
            ], deployer.address)
        ]);

        // Step 3: Multiple users buy tokens from first property
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(200)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(150)
            ], wallet2.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-tokens', [
                types.uint(0),
                types.uint(100)
            ], wallet3.address)
        ]);

        // Step 4: wallet3 buys the entire second property
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'buy-property', [
                types.uint(1)
            ], wallet3.address)
        ]);

        // Step 5: wallet1 creates a listing and wallet2 buys from it
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'create-token-listing', [
                types.uint(0),
                types.uint(50),
                types.uint(1200)
            ], wallet1.address),
            Tx.contractCall(CONTRACT_NAME, 'buy-listed-tokens', [
                types.uint(0)
            ], wallet2.address)
        ]);

        // Step 6: wallet2 transfers some tokens to wallet3
        block = chain.mineBlock([
            Tx.contractCall(CONTRACT_NAME, 'transfer-tokens', [
                types.uint(0),
                types.uint(25),
                types.principal(wallet3.address)
            ], wallet2.address)
        ]);

        // Verify final state
        // wallet1 should have: 200 - 50 = 150 tokens
        let wallet1Balance = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet1.address)
        ], wallet1.address);
        assertEquals(wallet1Balance.result.includes('token-count: u150'), true);

        // wallet2 should have: 150 + 50 - 25 = 175 tokens
        let wallet2Balance = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet2.address)
        ], wallet2.address);
        assertEquals(wallet2Balance.result.includes('token-count: u175'), true);

        // wallet3 should have: 100 + 25 = 125 tokens
        let wallet3Balance = chain.callReadOnlyFn(CONTRACT_NAME, 'get-token-balance', [
            types.uint(0),
            types.principal(wallet3.address)
        ], wallet3.address);
        assertEquals(wallet3Balance.result.includes('token-count: u125'), true);

        // wallet3 should own property 1
        let property1Query = chain.callReadOnlyFn(CONTRACT_NAME, 'get-property', [types.uint(1)], wallet3.address);
        assertEquals(property1Query.result.includes('owner: ' + wallet3.address), true);

        // Check final contract stats
        let statsQuery = chain.callReadOnlyFn(CONTRACT_NAME, 'get-contract-stats', [], deployer.address);
        assertEquals(statsQuery.result.includes('total-properties: u2'), true);
        assertEquals(statsQuery.result.includes('total-listings: u1'), true);
        // Should have multiple transactions: 3 MINT + 1 TRANSFER (property) + 1 LISTING + 1 TRANSFER (tokens) + 1 TRANSFER (direct) = 7
        assertEquals(statsQuery.result.includes('total-transactions: u7'), true);
    },
});