import type { Plugin } from 'vite'
import {
  handleE2eArkadeOperatorMockControlRequest,
  handleE2eArkadeOperatorMockRequest,
} from './arkade-operator-mock-handler'

export function e2eArkadeOperatorMockPlugin(): Plugin {
  return {
    name: 'e2e-arkade-operator-mock',
    configureServer(server) {
      if (process.env.VITE_E2E_ARKADE_MOCK !== 'true') {
        return
      }

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        void handleE2eArkadeOperatorMockControlRequest(req, res, url).then((handledControl) => {
          if (handledControl) {
            return
          }
          if (handleE2eArkadeOperatorMockRequest(req, res, url)) {
            return
          }
          next()
        })
      })
    },
  }
}
