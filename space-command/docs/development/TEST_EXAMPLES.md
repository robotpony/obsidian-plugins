# TODO Filtering Test Examples

Use this file to test the code block filtering feature. Create a note in your vault with this content to verify the plugin correctly filters out TODOs in code.

---

## Test Case 1: Regular TODOs (Should be tracked)

- [ ] Buy groceries #todo @2026-01-07
- [ ] Call the dentist #urgent #todo
Remember to file taxes #todo

**Expected:** 3 TODOs appear in sidebar/embeds

---

## Test Case 2: Inline Code TODOs (Should NOT be tracked)

To mark a task, use the `#todo` tag in your notes.

You can also use `#todone` for completed tasks.

Remember: the tag `#todo` is case-sensitive.

**Expected:** 0 TODOs (all are in backticks)

---

## Test Case 3: Code Block TODOs (Should NOT be tracked)

Here's an example of how to use the plugin:

```markdown
- [ ] Example task #todo
- [ ] Another example #todo
Use #todo tags anywhere!
```

**Expected:** 0 TODOs (all are in code block)

---

## Test Case 4: Mixed Content (Should track only non-code TODOs)

Use the `#todo` tag to create tasks #todo

Here's an example: `#todo` can be added anywhere.

And don't forget to review the PR #urgent #todo

```javascript
// Example code
const task = "Don't forget #todo";
function addTodo() {
  // Add a #todo tag
}
```

**Expected:** 2 TODOs (lines 1 and 3, not the inline codes or code block)

---

## Test Case 5: Multiple Inline Codes (Complex)

The syntax `#todo` and `#todone` are both valid tags #todo

Use `#todo` for active tasks and `#todone` for done ones.

**Expected:** 1 TODO (only the one at end of line 1)

---

## Test Case 6: Nested Code Blocks in Lists

1. First item with a TODO #todo
2. Second item with example:
   ```
   - [ ] Example #todo
   ```
3. Third item #todo

**Expected:** 2 TODOs (items 1 and 3, not the code block in item 2)

---

## Test Results

After adding this file to your vault:

1. Open the sidebar (Cmd/Ctrl+Shift+T)
2. Count the TODOs from this file
3. Expected total: **8 TODOs** (3 + 0 + 0 + 2 + 1 + 2)

Or create an embed in another note:

```markdown
{{focus-todos: todos/done.md | path:_plugins/weekly-log-helpers/}}
```

This will show only TODOs from the plugin directory.
