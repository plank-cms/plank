import { init } from './commands/init.js'
import { start } from './commands/start.js'

const [, , command, ...args] = process.argv

switch (command) {
  case 'init':
    await init(args[0])
    break
  case 'start':
    await start()
    break
  default:
    // Allow: npx @am25/plank-cms my-project (sin subcomando)
    if (command && !command.startsWith('-')) {
      await init(command)
    } else {
      console.error('Usage: plank <init|start> [project-name]')
      process.exit(1)
    }
}
