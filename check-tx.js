const { Connection, clusterApiUrl } = require('@solana/web3.js');

async function checkTransaction() {
    const connection = new Connection(clusterApiUrl('mainnet-beta'));
    const txId = 'BzH5QyBqnbyhLrqHjepz5cEjmqjr6EJNc9Ag8LhzSkBXQrGEPc1axm1Y8y5w6yWeTw7q5m8krVcRmVkEGsBLuf6';
    
    try {
        const tx = await connection.getTransaction(txId, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx) {
            console.log('Transaction not found');
            return;
        }

        console.log('Transaction Details:');
        console.log('-------------------');
        console.log('Status:', tx.meta?.err ? 'Failed' : 'Success');
        console.log('Slot:', tx.slot);
        console.log('Block Time:', new Date(tx.blockTime * 1000).toLocaleString());
        console.log('Fee:', tx.meta?.fee / 1e9, 'SOL');
        
        if (tx.meta?.postBalances && tx.meta?.preBalances) {
            console.log('\nBalance Changes:');
            tx.transaction.message.accountKeys.forEach((key, index) => {
                const preBalance = tx.meta.preBalances[index] / 1e9;
                const postBalance = tx.meta.postBalances[index] / 1e9;
                const change = postBalance - preBalance;
                if (change !== 0) {
                    console.log(`${key.toString()}: ${change > 0 ? '+' : ''}${change} SOL`);
                }
            });
        }

        if (tx.meta?.logMessages) {
            console.log('\nTransaction Logs:');
            tx.meta.logMessages.forEach(log => console.log(log));
        }

    } catch (error) {
        console.error('Error fetching transaction:', error);
    }
}

checkTransaction(); 