# Support

Need help with the Brainfile VSCode extension? Here are your options:

## Documentation

- **[Official Documentation](https://brainfile.md)** - Complete protocol specification, guides, and examples
- **[VSCode Extension Guide](https://brainfile.md/vscode/extension/)** - Detailed usage instructions
- **[Protocol Specification](https://brainfile.md/protocol/specification/)** - Learn the file format
- **[AI Agent Integration](https://brainfile.md/agents/integration/)** - Configure AI agent behavior

## Community Support

### GitHub Discussions
Ask questions, share ideas, and connect with other users:
- [Discussions](https://github.com/brainfile/protocol/discussions)

### GitHub Issues
Report bugs or request features:
- [VSCode Extension Issues](https://github.com/brainfile/vscode/issues)
- [Protocol Issues](https://github.com/brainfile/protocol/issues)

## Related Tools

- **[@brainfile/core](https://github.com/brainfile/core)** - Core TypeScript library
- **[@brainfile/cli](https://github.com/brainfile/cli)** - Command-line interface
- **[Protocol Repository](https://github.com/brainfile/protocol)** - Schema and specification

## Contributing

Want to help improve Brainfile?
- [Contributing Guide](https://github.com/brainfile/protocol/blob/main/CONTRIBUTING.md)
- [Code of Conduct](https://github.com/brainfile/protocol/blob/main/CODE_OF_CONDUCT.md)

## Quick Links

- **Website**: https://brainfile.md
- **GitHub Organization**: https://github.com/brainfile
- **npm Packages**: 
  - [@brainfile/core](https://www.npmjs.com/package/@brainfile/core)
  - [@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli)

## Common Issues

### Extension not activating
Make sure you have a `brainfile.md` file in your project root. The extension activates automatically when it detects this file.

### Tasks not appearing
Check that your YAML frontmatter is valid. Use the [@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli) lint command to validate:
```bash
npx @brainfile/cli lint
```

### Changes not syncing
The extension watches for file changes. If you're editing externally, make sure the file is saved and VSCode has focus.

## Need More Help?

Open an issue on GitHub with:
- Your VSCode version
- Extension version
- A minimal example of your brainfile.md
- Steps to reproduce the problem
- Any error messages from the Output panel (View → Output → Brainfile)

