import { Switch } from '@/shared/ui/switch.tsx'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs.tsx'

type LocalizationControlsProps = {
  localizationEnabled: boolean
  onToggleLocalization: (enabled: boolean) => void
  readOnly: boolean
  activeLocale: string
  onActiveLocaleChange: (locale: string) => void
  locales: string[]
}

export function LocalizationControls({
  localizationEnabled,
  onToggleLocalization,
  readOnly,
  activeLocale,
  onActiveLocaleChange,
  locales,
}: LocalizationControlsProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={localizationEnabled}
            onCheckedChange={onToggleLocalization}
            disabled={readOnly}
          />
          <div>
            <p className="text-sm font-medium">Localization</p>
            <p className="text-xs text-muted-foreground">Enable per-entry localization</p>
          </div>
        </div>
        <div />
      </div>
      <div>
        {localizationEnabled && (
          <Tabs value={activeLocale} onValueChange={onActiveLocaleChange}>
            <TabsList>
              {locales.map((locale) => (
                <TabsTrigger key={locale} value={locale} disabled={readOnly}>
                  {locale.toUpperCase()}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
    </div>
  )
}
