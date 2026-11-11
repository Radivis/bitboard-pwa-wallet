import { useQuery } from '@tanstack/react-query'
import {
  addressNeedsWorkerCheck,
  isValidAddress,
} from '@/lib/wallet/bitcoin-address'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import type { NetworkMode } from '@/stores/walletStore'
import { getCryptoWorker } from '@/workers/crypto-factory'

/**
 * Segwit is decided on the page. A base58 candidate is decided by the crypto
 * worker, which uses the same parser as send. A failed segwit string is never
 * sent to the worker.
 */
export function useOnchainAddressAccepted(
  address: string,
  networkMode: NetworkMode,
) {
  const segwitValid = isValidAddress(address, networkMode)
  const askWorker = addressNeedsWorkerCheck(address, networkMode)
  const bitcoinNetwork = toBitcoinNetwork(networkMode)
  const workerCheck = useQuery({
    queryKey: ['bitcoin-address-is-valid', bitcoinNetwork, address],
    enabled: askWorker,
    queryFn: () => getCryptoWorker().bitcoinAddressIsValid(address, bitcoinNetwork),
    staleTime: Infinity,
    retry: false,
  })

  return {
    onchainAddressValid: segwitValid || workerCheck.data === true,
    onchainAddressCheckPending:
      askWorker && workerCheck.data == null && !workerCheck.isError,
  }
}
