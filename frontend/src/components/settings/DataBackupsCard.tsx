import { useCallback, useEffect, useState } from 'react'
import { Database, FlaskConical, FileWarning } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LAB_SQLITE_OPFS_BASENAME, WALLET_SQLITE_OPFS_BASENAME } from '@/db/opfs-sqlite-database-names'
import { WALLET_MIGRATION_FAILURE_OPFS_FILENAME } from '@/db/migrations/wallet-migration-failure-report'
import {
  opfsRootFileExists,
  readBlobFromOpfsRootIfExists,
  readTextFileFromOpfsRootIfExists,
  triggerBrowserSaveLocalBlob,
} from '@/lib/opfs-root-file'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'

const WALLET_EXPORT_FILENAME = 'bitboard-wallet-backup.sqlite'
const LAB_EXPORT_FILENAME = 'bitboard-lab-backup.sqlite'

export function DataBackupsCard() {
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const [migrationReportExists, setMigrationReportExists] = useState(false)
  const [labFileExists, setLabFileExists] = useState<boolean | null>(null)
  const [exportBusy, setExportBusy] = useState<'wallet' | 'lab' | 'report' | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [report, lab] = await Promise.all([
          opfsRootFileExists(WALLET_MIGRATION_FAILURE_OPFS_FILENAME),
          opfsRootFileExists(LAB_SQLITE_OPFS_BASENAME),
        ])
        if (!cancelled) {
          setMigrationReportExists(report)
          setLabFileExists(lab)
        }
      } catch {
        if (!cancelled) {
          setMigrationReportExists(false)
          setLabFileExists(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const exportWallet = useCallback(async () => {
    setExportBusy('wallet')
    try {
      const blob = await readBlobFromOpfsRootIfExists(WALLET_SQLITE_OPFS_BASENAME)
      if (!blob) {
        toast.error('Wallet data file was not found in local storage.')
        return
      }
      triggerBrowserSaveLocalBlob(blob, WALLET_EXPORT_FILENAME)
      toast.success('Wallet data exported to a file on this device.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExportBusy(null)
    }
  }, [])

  const exportLab = useCallback(async () => {
    setExportBusy('lab')
    try {
      const blob = await readBlobFromOpfsRootIfExists(LAB_SQLITE_OPFS_BASENAME)
      if (!blob) {
        toast.error('Lab data file was not found. Open the Lab at least once to create it.')
        return
      }
      triggerBrowserSaveLocalBlob(blob, LAB_EXPORT_FILENAME)
      toast.success('Lab data exported to a file on this device.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExportBusy(null)
    }
  }, [])

  const exportMigrationReport = useCallback(async () => {
    setExportBusy('report')
    try {
      const text = await readTextFileFromOpfsRootIfExists(WALLET_MIGRATION_FAILURE_OPFS_FILENAME)
      if (!text) {
        toast.error('Migration error report was not found.')
        setMigrationReportExists(false)
        return
      }
      triggerBrowserSaveLocalBlob(
        new Blob([text], { type: 'application/json' }),
        WALLET_MIGRATION_FAILURE_OPFS_FILENAME,
      )
      toast.success('Error report exported to a file on this device.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExportBusy(null)
    }
  }, [])

  return (
    <Card id="data-backups">
      <CardHeader>
        <CardTitle>Data Backups</CardTitle>
        <CardDescription>
          Export full local database files from this device. They are not uploaded anywhere. Wallet and
          lab exports contain sensitive data—store them safely.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="outline"
            disabled={nearZeroActive || exportBusy !== null}
            onClick={() => void exportWallet()}
            className="w-full sm:w-auto"
          >
            <Database className="size-4" aria-hidden />
            Export wallet data
          </Button>
          {nearZeroActive ? (
            <p className="text-sm text-muted-foreground sm:max-w-md">
              Wallet export is not available in near-zero security mode. Set a real app password in
              Security first so your backup reflects full encryption.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="outline"
            disabled={labFileExists === false || exportBusy !== null}
            onClick={() => void exportLab()}
            className="w-full sm:w-auto"
          >
            <FlaskConical className="size-4" aria-hidden />
            Export lab data
          </Button>
          {labFileExists === false ? (
            <p className="text-sm text-muted-foreground sm:max-w-md">
              No lab database file yet. Open the Lab once to create local lab data.
            </p>
          ) : null}
        </div>

        {migrationReportExists ? (
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-start">
            <Button
              type="button"
              variant="outline"
              disabled={exportBusy !== null}
              onClick={() => void exportMigrationReport()}
              className="w-full shrink-0 sm:w-auto"
            >
              <FileWarning className="size-4" aria-hidden />
              Export migration error report
            </Button>
            <p className="text-sm text-muted-foreground sm:min-w-0 sm:flex-1">
              Send this file to app support for diagnosis. Support contact details are in the About
              section (TBD).
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
