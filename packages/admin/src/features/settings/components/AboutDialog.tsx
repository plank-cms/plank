import { BookOpenIcon, InfoIcon } from 'lucide-react'
import { Badge } from '@/shared/ui/badge.tsx'
import { Button } from '@/shared/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog.tsx'

const info = __PLANK_BUILD_INFO__

export function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <InfoIcon data-icon="inline-start" />
          About Plank
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader className="items-center text-center sm:text-center">
          <img
            src={`${import.meta.env.BASE_URL}plank-logo-w.svg`}
            alt=""
            className="mb-4 h-14 w-auto self-center"
          />
          <DialogTitle>Plank CMS</DialogTitle>
          <DialogDescription>Self-hosted headless CMS by AM25.</DialogDescription>
        </DialogHeader>

        <dl className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="mt-1 font-medium">{info.version}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Git SHA</dt>
            <dd className="mt-1 font-mono text-xs">
              {info.gitSha ? (
                <a
                  href={`https://github.com/plank-cms/plank/releases/tag/${encodeURIComponent(info.version)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={info.gitSha}
                  className="underline underline-offset-4"
                >
                  {info.gitSha.slice(0, 7)}
                </a>
              ) : (
                'Unavailable'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Author</dt>
            <dd className="mt-1">
              <a
                href={info.author.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {info.author.name}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">License</dt>
            <dd className="mt-1">{info.license}</dd>
          </div>
        </dl>

        <details className="rounded-md border p-4 text-sm">
          <summary className="cursor-pointer font-medium">Copyright and license</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
            {info.licenseText}
          </pre>
        </details>

        <section aria-labelledby="plank-dependencies-title" className="flex flex-col gap-3">
          <h3 id="plank-dependencies-title" className="flex items-center gap-2 text-sm font-medium">
            <BookOpenIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            Third-party software
          </h3>
          <p className="text-xs text-muted-foreground">
            Direct runtime dependencies of the admin, API, database, and schema packages.
          </p>
          <ul className="max-h-64 overflow-y-auto rounded-md border">
            {info.dependencies.map((dependency) => (
              <li
                key={`${dependency.name}@${dependency.version}`}
                className="flex items-center justify-between gap-4 border-b px-4 py-3 text-xs last:border-b-0"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-all font-medium">{dependency.name}</span>
                  <span className="text-muted-foreground">{dependency.version}</span>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {dependency.license}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-center text-xs text-muted-foreground">Developed by AM25</p>
      </DialogContent>
    </Dialog>
  )
}
