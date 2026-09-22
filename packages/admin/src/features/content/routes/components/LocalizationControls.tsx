import { Switch } from '@/shared/ui/switch.tsx'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs.tsx'

type LocalizationProps = {
  localizationEnabled: boolean
  onToggleLocalization: (enabled: boolean) => void
  readOnly: boolean
  activeLocale: string
  onActiveLocaleChange: (locale: string) => void
  locales: string[]
  defaultLocale: string
}

type LocalizationControlsProps = Pick<
  LocalizationProps,
  'localizationEnabled' | 'onToggleLocalization' | 'readOnly'
>

export function LocalizationControls({
  localizationEnabled,
  onToggleLocalization,
  readOnly,
}: LocalizationControlsProps) {
  return (
    <div className="mb-4 flex items-center">
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
    </div>
  )
}

type LocalizationTabsProps = Pick<
  LocalizationProps,
  'readOnly' | 'activeLocale' | 'onActiveLocaleChange' | 'locales' | 'defaultLocale'
>

export function LocalizationTabs({
  readOnly,
  activeLocale,
  onActiveLocaleChange,
  locales,
  defaultLocale,
}: LocalizationTabsProps) {
  const orderedLocales = [...new Set([defaultLocale, ...locales])].sort((left, right) => {
    if (left === defaultLocale) return -1
    if (right === defaultLocale) return 1
    return left.localeCompare(right)
  })

  return (
    <Tabs value={activeLocale} onValueChange={onActiveLocaleChange}>
      <TabsList className="w-auto">
        {orderedLocales.map((locale) => (
          <TabsTrigger key={locale} value={locale} disabled={readOnly}>
            {locale.toUpperCase()}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
