## How venvs work [¶](https://docs.python.org/3/library/venv.html\#how-venvs-work "Link to this heading")

When a Python interpreter is running from a virtual environment,
[`sys.prefix`](https://docs.python.org/3/library/sys.html#sys.prefix "sys.prefix") and [`sys.exec_prefix`](https://docs.python.org/3/library/sys.html#sys.exec_prefix "sys.exec_prefix")
point to the directories of the virtual environment,
whereas [`sys.base_prefix`](https://docs.python.org/3/library/sys.html#sys.base_prefix "sys.base_prefix") and [`sys.base_exec_prefix`](https://docs.python.org/3/library/sys.html#sys.base_exec_prefix "sys.base_exec_prefix")
point to those of the base Python used to create the environment.
It is sufficient to check
`sys.prefix != sys.base_prefix` to determine if the current interpreter is
running from a virtual environment.

A virtual environment may be “activated” using a script in its binary directory
(`bin` on POSIX; `Scripts` on Windows).
This will prepend that directory to your `PATH`, so that running
**python** will invoke the environment’s Python interpreter
and you can run installed scripts without having to use their full path.
The invocation of the activation script is platform-specific
(`<venv>` must be replaced by the path to the directory
containing the virtual environment):

| Platform | Shell | Command to activate virtual environment |
| --- | --- | --- |
| POSIX | bash/zsh | `$ source <venv>/bin/activate` |
| fish | `$ source <venv>/bin/activate.fish` |
| csh/tcsh | `$ source <venv>/bin/activate.csh` |
| pwsh | `$ <venv>/bin/Activate.ps1` |
| Windows | cmd.exe | `C:\> <venv>\Scripts\activate.bat` |
| PowerShell | `PS C:\> <venv>\Scripts\Activate.ps1` |

Added in version 3.4: **fish** and **csh** activation scripts.

Added in version 3.8: PowerShell activation scripts installed under POSIX for PowerShell Core
support.

You don’t specifically _need_ to activate a virtual environment,
as you can just specify the full path to that environment’s
Python interpreter when invoking Python.
Furthermore, all scripts installed in the environment
should be runnable without activating it.

In order to achieve this, scripts installed into virtual environments have
a “shebang” line which points to the environment’s Python interpreter,
`#!/<path-to-venv>/bin/python`.
This means that the script will run with that interpreter regardless of the
value of `PATH`. On Windows, “shebang” line processing is supported if
you have the [Python install manager](https://docs.python.org/3/using/windows.html#launcher) installed. Thus, double-clicking an installed
script in a Windows Explorer window should run it with the correct interpreter
without the environment needing to be activated or on the `PATH`.

When a virtual environment has been activated, the `VIRTUAL_ENV`
environment variable is set to the path of the environment.
Since explicitly activating a virtual environment is not required to use it,
`VIRTUAL_ENV` cannot be relied upon to determine
whether a virtual environment is being used.

Warning

Because scripts installed in environments should not expect the
environment to be activated, their shebang lines contain the absolute paths
to their environment’s interpreters. Because of this, environments are
inherently non-portable, in the general case. You should always have a
simple means of recreating an environment (for example, if you have a
requirements file `requirements.txt`, you can invoke `pip install -r
requirements.txt` using the environment’s `pip` to install all of the
packages needed by the environment). If for any reason you need to move the
environment to a new location, you should recreate it at the desired
location and delete the one at the old location. If you move an environment
because you moved a parent directory of it, you should recreate the
environment in its new location. Otherwise, software installed into the
environment may not work as expected.

You can deactivate a virtual environment by typing `deactivate` in your shell.
The exact mechanism is platform-specific and is an internal implementation
detail (typically, a script or shell function will be used).