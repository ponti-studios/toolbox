# @ponti-studios/iconkit (deprecated)

> **Deprecated:** IconKit has been renamed to **ImageKit**. Install `@ponti-studios/imagekit` instead.

```bash
npm install -g @ponti-studios/imagekit
# imagekit is primary; iconkit and photokit remain as aliases
imagekit --help
iconkit --help
photokit --help
```

This package is a compatibility shim that depends on `@ponti-studios/imagekit` and exposes the `iconkit` executable. It will print a migration warning on install.

Please update your dependencies:

```diff
- "@ponti-studios/iconkit"
+ "@ponti-studios/imagekit"
```

And update scripts:

```diff
- iconkit optimize -s 500x500 ...
+ imagekit optimize -s 500x500 ...
```

`iconkit` and `photokit` continue to work as binary aliases for `imagekit`.

See [`apps/imagekit/README.md`](../imagekit/README.md) for full documentation.
