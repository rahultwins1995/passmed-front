// Shared "download a generated report" helper - used by the export buttons
// on the dashboard, mock-exams and settings pages (the Reports page has its
// own richer flow with the recent-reports list).
//
// Calls GET /reports/generate on the institute API - the exact same auth
// path as every other institute call (dev: direct Laravel with the browser's
// auth; prod: via the Nuxt proxy) - and triggers a browser download of the
// returned PDF/CSV file.
import { ref } from 'vue'

export const useReportDownload = () => {
  const api = useInstituteApi()
  const downloading = ref(false)

  async function downloadReport(
    params: Record<string, string>,
    fallbackName: string,
  ): Promise<{ ok: boolean; filename?: string; error?: string }> {
    if (downloading.value) return { ok: false }
    downloading.value = true
    try {
      const res = await api.raw<Blob>('/reports/generate', { query: params, responseType: 'blob' })
      const blob = res._data as Blob
      if (!blob || (blob.type || '').includes('application/json')) {
        throw new Error('Report generation failed')
      }
      const cd = res.headers.get('content-disposition') || ''
      const m = cd.match(/filename="([^"]+)"/)
      // Stamp the fallback (DD-MM-YYYY-HH-MM-SS) when the cross-origin
      // Content-Disposition header isn't readable (dev direct-to-Laravel).
      const d = new Date()
      const p = (x: number) => String(x).padStart(2, '0')
      const ts = `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
      // Keep the backend's base name but always stamp with the user's LOCAL
      // time (the server Content-Disposition carries UTC).
      const ext = fallbackName.match(/\.([a-z0-9]+)$/i)?.[1] || 'pdf'
      let base = (m?.[1] || fallbackName).replace(/\.[a-z0-9]+$/i, '')
      base = base.replace(/-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{2}$/, '')
      const filename = `${base}-${ts}.${ext}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      return { ok: true, filename }
    } catch (e: any) {
      logError('[report-download] failed', e)
      let error = 'Export failed - try again'
      try {
        const data = e?.data
        if (data instanceof Blob) {
          const j = JSON.parse(await data.text())
          error = j?.msg || j?.message || error
        } else if (data?.msg || data?.message) {
          error = data.msg || data.message
        }
      } catch { /* keep generic */ }
      return { ok: false, error }
    } finally {
      downloading.value = false
    }
  }

  return { downloading, downloadReport }
}
