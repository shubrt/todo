# Agent notes

- The installed app on the owner's Mac is built from `main` with `vp run install:mac`
  (see docs/desktop.md). After merging a pull request into `main`, run it from this
  repository so the installed app matches `main`. It quits and restarts todo; say so in
  the reply.
- Merging into `main` also deploys the web app at https://task.shubrt.me through Railway
  (see docs/web.md#hosting). No command is needed for that.
