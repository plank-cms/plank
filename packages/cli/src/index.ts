import { init } from './commands/init.js'
import { start } from './commands/start.js'
import { publishScheduled } from './commands/publish-scheduled.js'
import { update } from './commands/update.js'

const [, , command, ...args] = process.argv

switch (command) {
  case 'init':
    await init(args[0])
    break
  case undefined:
  case 'start':
    await start()
    break
  case 'publish-scheduled':
    await publishScheduled()
    break
  case 'update':
    await update(args[0])
    break
  default:
    // Allow: npx @plank-cms/plank my-project (sin subcomando)
    if (command && !command.startsWith('-')) {
      await init(command)
    } else {
      console.error('Usage: plank [start|init|publish-scheduled|update] [project-name|version]')
      process.exit(1)
    }
}
