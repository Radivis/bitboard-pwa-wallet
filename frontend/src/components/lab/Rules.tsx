import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LAB_MAX_BLOCKS_PER_MINE } from '@/workers/lab-api'

export function LabRulesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
        <CardDescription>
          How the lab simulation works and how it differs from Bitcoin mainnet
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          <li>
            <strong>No Proof of Work.</strong> In the lab, new blocks are created by clicking
            &quot;Mine blocks&quot;. On mainnet, miners must solve a cryptographic puzzle
            (Proof of Work) to produce a valid block. You can mine at most{' '}
            {LAB_MAX_BLOCKS_PER_MINE} blocks per click so the app stays responsive; run mining
            again if you need more height.
          </li>
          <li>
            <strong>Immediate coinbase spendability.</strong> Newly mined coins can be spent
            immediately in the lab. On mainnet, coinbase outputs require 100 confirmations
            before they can be spent.
          </li>
          <li>
            <strong>Mempool first.</strong> New transactions enter the mempool and stay there
            until a block is mined. Mining a block includes mempool transactions and confirms
            them.
          </li>
          <li>
            <strong>Transaction fees go to the miner.</strong> When a block is mined, all
            fees from the included transactions are added to the coinbase output, just like
            on mainnet.
          </li>
          <li>
            <strong>One spend per UTXO.</strong> Each UTXO can only be spent once in a
            block. If two mempool transactions try to spend the same UTXO (double-spend),
            only the one with the higher fee is included. Ties are decided randomly. The
            losing transaction is discarded from the mempool entirely.
          </li>
          <li>
            <strong>Balances reflect confirmed UTXOs only.</strong> Unconfirmed (mempool)
            spends do not reduce your balance until the block is mined. You can create
            conflicting transactions to observe this.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
