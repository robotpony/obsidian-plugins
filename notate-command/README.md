# [NC] Note-command plugin for obsidian

The note-command is a plugin with a sidebar to add notes (i.e. notate) to your daily or weekly notes, in a format that you (or AI) can review later and delegate/organize as needed. Notes are appended to the daily or weekly Obsidian log file in a section set in configuration.

Notes are added as text, which can be markdown (formatting applied when added to your notes).

The plugin follows conventions of the other workflow-automation plugins in the repository (including styling, chrome, branding, menus, and configuration).

## Settings

- default note header (e.g., *Misc. notes #nc*)
- recent notes limit (size of history of recent notes)
- log file folder (defaults to )

## UX
 
Sidebar:

```
+------------------------------+
| [NC] Note command          ⠇ |
++----------------------------++
|| > enter note here          ||
|| multiple lines of notes.   ||
|| an                  [ ✉️ ] ||
++----------------------------++
| Recent notes                 |
|  +- 01/04/26 (5)          →  |
|                              |
|                              |
|                              |
|                              |
++----------------------------++
```


1. Title and kabob menu (standard items: configuration, about)
2. Note entry: text area, default value (*Add a note ...*), and "send" button
    - default of multi-line + command-enter to send (if reasonable in obsidian)
3. Recent notes lists note file name, and arrow clicks open obsidian to the file and section. Total ad hoc notes are summarized in brackets.
