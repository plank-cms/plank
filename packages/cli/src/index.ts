import { init } from './commands/init.js'
import { start } from './commands/start.js'
import { publishScheduled } from './commands/publish-scheduled.js'

const [, , command, ...args] = process.argv

switch (command) {
  case 'init':
    await init(args[0])
    break
  case 'start':
    await start()
    break
  case 'publish-scheduled':
    await publishScheduled()
    break
  default:
    // Allow: npx @am25/plank-cms my-project (sin subcomando)
    if (command && !command.startsWith('-')) {
      await init(command)
    } else {
      console.error('Usage: plank <init|start|publish-scheduled> [project-name]')
      process.exit(1)
    }
}
