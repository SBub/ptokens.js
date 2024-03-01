import { ChainId, BlockchainType } from '@p.network/ptokens-constants'
import { pTokensAsset, pTokenAssetConfig } from '@p.network/ptokens-entities'

import { pTokensUtxoProvider } from './ptokens-utxo-provider'
import { pTokensDepositAddress } from './ptokens-deposit-address'

import PromiEvent from 'promievent'
import BigNumber from 'bignumber.js'

const confirmations: Map<ChainId, number> = new Map([[ChainId.BitcoinMainnet, 1]])
const POLLING_TIME = 3000

export type pTokenUtxoAssetConfig = pTokenAssetConfig & {
  /** An pTokensUtxoProvider for interacting with the underlaying blockchain */
  provider?: pTokensUtxoProvider
}
export class pTokensUtxoAsset extends pTokensAsset {
  private _provider: pTokensUtxoProvider

  /**
   * Create and initialize a pTokensUtxoAsset object. pTokensUtxoAsset objects shall be created with a pTokensUtxoAssetBuilder instance.
   */
  constructor(_config: pTokenUtxoAssetConfig) {
    super(_config, BlockchainType.UTXO)
    this._provider = _config.provider
  }

  get provider() {
    return this._provider
  }

  protected waitForDeposit(_address: string): PromiEvent<string> {
    const promi = new PromiEvent<string>(
      (resolve) =>
        (async () => {
          const nativeTxId = await this._provider
            .monitorUtxoByAddress(_address, POLLING_TIME, confirmations.get(this.chainId) || 1)
            .on('txBroadcasted', (_txId) => promi.emit('txBroadcasted', _txId))
            .on('txConfirmed', (_txId) => promi.emit('txConfirmed', _txId))
          resolve(nativeTxId)
        })() as unknown
    )
    return promi
  }

  protected nativeToInterim(
    _amount: BigNumber,
    _destinationAddress: string,
    _destinationChainId: string
  ): PromiEvent<string> {
    const promi = new PromiEvent<string>(
      (resolve, reject) =>
        (async () => {
          try {
            if (!this.node) return reject(new Error('Undefined node'))
            if (!_destinationChainId) return reject(new Error('Undefined chain ID'))
            if (!this._provider) return reject(new Error('Missing provider'))
            if (!this.assetInfo.isNative)
              return reject(new Error('Invalid call to nativeToInterim() for non-native token'))
            const config = { node: this.node }
            const depositAddress = new pTokensDepositAddress(config)
            const address = await depositAddress.generate(_destinationAddress, this.chainId, _destinationChainId)
            promi.emit('depositAddress', address)
            const txHash: string = await this.waitForDeposit(address)
              .on('txBroadcasted', (_txHash) => promi.emit('txBroadcasted', _txHash))
              .on('txConfirmed', (_txHash) => promi.emit('txConfirmed', _txHash))
            return resolve(txHash)
          } catch (err) {
            return reject(err)
          }
        })() as unknown
    )
    return promi
  }

  protected hostToInterim(): PromiEvent<string> {
    throw new Error('No ptokens in a UTXO blockchain')
  }
}
