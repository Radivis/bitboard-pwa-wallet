import { test, expect, makeUser, getCookieHeader } from '../fixtures'

test.describe('Blog - Public Pages', () => {
  test('public blog page displays published posts', async ({ page, backendApp, frontendServer, authenticatedPage }) => {
    // Create 2 published posts and 1 draft post via API
    const createPost = async (title: string, status: 'draft' | 'published') => {
      const response = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': getCookieHeader(await authenticatedPage.page.context().cookies()),
        },
        body: JSON.stringify({
          title,
          content: `# ${title}\n\nContent for ${title}`,
          status,
        }),
      })
      expect(response.ok).toBeTruthy()
      return response.json()
    }

    await createPost('Published Post 1', 'published')
    await createPost('Published Post 2', 'published')
    await createPost('Draft Post', 'draft')

    // Navigate to public blog page (using unauthenticated page)
    await page.goto(`${frontendServer.url}/blog`)

    // Verify page title
    await expect(page.getByRole('heading', { name: 'Blog', level: 1 })).toBeVisible()

    // Verify 2 published posts are visible (use H2 headings which are the post card titles)
    await expect(page.getByRole('heading', { name: 'Published Post 1', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Published Post 2', level: 2 })).toBeVisible()

    // Verify draft post is NOT visible
    await expect(page.getByRole('heading', { name: 'Draft Post', level: 2 })).not.toBeVisible()

    // Verify posts show author and date
    await expect(page.getByText(`By ${authenticatedPage.username}`).first()).toBeVisible()
  })

  test('infinite scroll loads more posts', async ({ page, backendApp, frontendServer, authenticatedPage }) => {
    // Create 10 published posts with unique prefix
    for (let i = 1; i <= 10; i++) {
      const response = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': getCookieHeader(await authenticatedPage.page.context().cookies()),
        },
        body: JSON.stringify({
          title: `ScrollTest ${i}`,
          content: `Content ${i}`,
          status: 'published',
        }),
      })
      expect(response.ok).toBeTruthy()
    }

    await page.goto(`${frontendServer.url}/blog`)

    // API returns posts ordered by created_at DESC (newest first). Use unique prefix to avoid collisions with parallel tests.
    const scrollPostPrefix = 'ScrollTest '
    const scrollHeadings = page.getByRole('heading', { name: new RegExp(`^${scrollPostPrefix}\\d+$`), level: 2 })
    await expect(scrollHeadings.first()).toBeVisible({ timeout: 10000 })
    const initialCount = await scrollHeadings.count()

    // Scroll to bottom to trigger infinite scroll
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // Wait for ScrollTest 1 (oldest, last in DESC order) - proves second batch loaded
    await expect(page.getByRole('heading', { name: 'ScrollTest 1', exact: true, level: 2 })).toBeVisible({ timeout: 10000 })
    const afterScrollCount = await scrollHeadings.count()
    expect(afterScrollCount).toBeGreaterThanOrEqual(initialCount)
  })

  test('blog post detail page works', async ({ page, backendApp, frontendServer, authenticatedPage }) => {
    // Create a published post
    const createResponse = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': getCookieHeader(await authenticatedPage.page.context().cookies()),
      },
      body: JSON.stringify({
        title: 'Detail Test Post',
        content: '# Main Heading\n\nThis is **bold** text.\n\n- List item 1\n- List item 2',
        status: 'published',
      }),
    })
    expect(createResponse.ok).toBeTruthy()
    const post = await createResponse.json()

    // Navigate to post detail page
    await page.goto(`${frontendServer.url}/blog/${post.id}`)

    // Verify post title (H1, level 3 typography in MUI)
    await expect(page.getByRole('heading', { name: 'Detail Test Post', level: 1 }).first()).toBeVisible()
    await expect(page.getByText(`By ${authenticatedPage.username}`)).toBeVisible()
    await expect(page.getByText('Main Heading')).toBeVisible()
    await expect(page.getByText('bold')).toBeVisible()
    await expect(page.getByText('List item 1')).toBeVisible()

    // Click "Back to Blog" button
    await page.getByRole('link', { name: /Back to blog/i }).click()

    // Verify navigation to blog list
    await expect(page).toHaveURL(/\/blog$/)
  })

  test('public blog list accessible without authentication', async ({ page, frontendServer }) => {
    // Navigate to blog without authentication
    await page.goto(`${frontendServer.url}/blog`)

    // Should load successfully
    await expect(page.getByRole('heading', { name: 'Blog', level: 1 })).toBeVisible()
  })
})

test.describe('Blog - Admin Management', () => {
  test('admin can create new blog post', async ({ authenticatedPage, frontendServer }) => {
    test.setTimeout(60000)
    const { page } = authenticatedPage

    // Navigate to admin blog list
    await page.goto(`${frontendServer.url}/admin/blog`)

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'Manage Blog Posts', level: 1 })).toBeVisible({ timeout: 10000 })

    // Click "New Post" button (has aria-label="Create new blog post")
    await page.getByRole('link', { name: /Create new blog post/i }).click()

    // Verify navigation to create page
    await expect(page).toHaveURL(/\/admin\/blog\/new/)
    await expect(page.getByRole('heading', { name: 'Create New Blog Post', level: 1 })).toBeVisible()

    // Fill in form
    await page.getByLabel('Title').fill('Test Blog Post')
    
    // Fill in SimpleMDE editor (textarea) - wait for it to be ready
    const editor = page.locator('.CodeMirror textarea').first()
    await editor.waitFor({ state: 'attached', timeout: 15000 })
    await editor.fill('# Test Content\n\nThis is a test post.')

    // Wait for Status field and select Published
    await page.getByTestId('blog-status-select').waitFor({ state: 'visible', timeout: 15000 })
    await page.getByTestId('blog-status-select').click()
    await page.getByRole('option', { name: 'Published' }).click()

    // Click Save
    await page.getByRole('button', { name: /Save/i }).click()

    // Verify navigation back to list
    await expect(page).toHaveURL(/\/admin\/blog$/)

    // Verify new post appears in table
    await expect(page.getByRole('cell', { name: 'Test Blog Post', exact: true })).toBeVisible()
    await expect(page.getByText('published').first()).toBeVisible()
  })

  test('admin can edit existing blog post', async ({ authenticatedPage, backendApp, frontendServer }) => {
    test.setTimeout(60000)
    const { page } = authenticatedPage

    // Create a post via API
    const cookieHeader = getCookieHeader(await page.context().cookies())

    const createResponse = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({
        title: 'Original Title',
        content: 'Original content',
        status: 'draft',
      }),
    })
    expect(createResponse.ok).toBeTruthy()
    const post = await createResponse.json()

    // Navigate to admin blog list
    await page.goto(`${frontendServer.url}/admin/blog`)

    // Wait for table to load
    await expect(page.getByRole('heading', { name: 'Manage Blog Posts', level: 1 })).toBeVisible({ timeout: 10000 })

    // Click edit button for the post
    await page.getByLabel(`Edit Original Title`).click()

    // Verify navigation to edit page
    await expect(page).toHaveURL(`/admin/blog/${post.id}/edit`)
    await expect(page.getByRole('heading', { name: 'Edit Blog Post', level: 1 })).toBeVisible()

    // Verify form is pre-filled
    await expect(page.getByLabel('Title')).toHaveValue('Original Title')

    // Update title
    await page.getByLabel('Title').clear()
    await page.getByLabel('Title').fill('Updated Title')

    // Update status
    await page.getByTestId('blog-status-select').waitFor({ state: 'visible', timeout: 15000 })
    await page.getByTestId('blog-status-select').click()
    await page.getByRole('option', { name: 'Published' }).click()

    // Click Save
    await page.getByRole('button', { name: /Save/i }).click()

    // Verify navigation back to list
    await expect(page).toHaveURL(/\/admin\/blog$/)

    // Verify updated post in table
    await expect(page.getByRole('cell', { name: 'Updated Title', exact: true })).toBeVisible()
    await expect(page.getByText('published').first()).toBeVisible()
  })

  test('admin can delete blog post', async ({ authenticatedPage, backendApp, frontendServer }) => {
    const { page } = authenticatedPage

    // Create 2 posts via API
    const cookieHeader = getCookieHeader(await page.context().cookies())

    for (let i = 1; i <= 2; i++) {
      const response = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
        },
        body: JSON.stringify({
          title: `Post ${i}`,
          content: `Content ${i}`,
          status: 'published',
        }),
      })
      expect(response.ok).toBeTruthy()
    }

    // Navigate to admin blog list
    await page.goto(`${frontendServer.url}/admin/blog`)

    // Verify both posts are visible (exact: true to match title cell only, not actions cell)
    await expect(page.getByRole('cell', { name: 'Post 1', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Post 2', exact: true })).toBeVisible()

    // Click delete button for first post
    await page.getByLabel('Delete Post 1').click()

    // Verify confirmation dialog appears
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Confirm Delete')).toBeVisible()
    await expect(page.getByText('"Post 1"')).toBeVisible()

    // Click Delete in dialog
    await page.getByRole('button', { name: 'Delete' }).click()

    // Wait for deletion to complete
    await expect(page.getByRole('cell', { name: 'Post 1', exact: true })).not.toBeVisible()

    // Verify only 1 post remains
    await expect(page.getByRole('cell', { name: 'Post 2', exact: true })).toBeVisible()
  })

  test('delete confirmation can be cancelled', async ({ authenticatedPage, backendApp, frontendServer }) => {
    const { page } = authenticatedPage

    // Create a post via API
    const cookieHeader = getCookieHeader(await page.context().cookies())

    const response = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({
        title: 'Test Post',
        content: 'Content',
        status: 'published',
      }),
    })
    expect(response.ok).toBeTruthy()

    // Navigate to admin blog list
    await page.goto(`${frontendServer.url}/admin/blog`)

    // Click delete button
    await page.getByLabel('Delete Test Post').click()

    // Verify dialog appears
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    // Verify post still in table
    await expect(page.getByRole('cell', { name: 'Test Post', exact: true })).toBeVisible()
  })

  test('draft posts not visible on public page but visible in admin', async ({ page, authenticatedPage, backendApp, frontendServer }) => {
    // Create a draft post via API
    const cookieHeader = getCookieHeader(await authenticatedPage.page.context().cookies())

    const response = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({
        title: 'Draft Post',
        content: 'Draft content',
        status: 'draft',
      }),
    })
    expect(response.ok).toBeTruthy()

    // Navigate to public blog (unauthenticated page)
    await page.goto(`${frontendServer.url}/blog`)

    // Verify draft post NOT visible (check for H2 heading in blog list)
    await expect(page.getByRole('heading', { name: 'Draft Post', level: 2 })).not.toBeVisible()

    // Navigate to admin blog list (authenticated page)
    await authenticatedPage.page.goto(`${frontendServer.url}/admin/blog`)

    // Verify draft post IS visible in admin table
    await expect(authenticatedPage.page.getByRole('cell', { name: 'Draft Post', exact: true })).toBeVisible()
    await expect(authenticatedPage.page.getByText('draft', { exact: true }).first()).toBeVisible()
  })

  test('markdown editor preview theme toggle works', async ({ authenticatedPage, frontendServer }) => {
    const { page } = authenticatedPage

    // Navigate to create new post
    await page.goto(`${frontendServer.url}/admin/blog/new`)

    // Fill in title and content
    await page.getByLabel('Title').fill('Theme Test Post')
    
    const editor = page.locator('.CodeMirror textarea').first()
    await editor.fill('# Test Content')

    // Click preview button in SimpleMDE toolbar
    await page.locator('.editor-toolbar button[title*="Preview"]').first().click()

    // Wait for preview to be active
    await page.waitForTimeout(500)

    // Verify preview theme toggle buttons are visible
    await expect(page.getByLabel('light preview')).toBeVisible()
    await expect(page.getByLabel('dark preview')).toBeVisible()

    // Click dark mode toggle
    await page.getByLabel('dark preview').click()

    // Verify dark preview styling (check for dark background class)
    const editorWrapper = page.locator('.editor-wrapper')
    const classNames = await editorWrapper.getAttribute('class')
    expect(classNames).toContain('dark-preview')

    // Click light mode toggle
    await page.getByLabel('light preview').click()

    // Verify light preview (dark-preview class should be removed)
    const lightClassNames = await editorWrapper.getAttribute('class')
    expect(lightClassNames).not.toContain('dark-preview')
  })
})

test.describe('Blog - Authorization', () => {
  test('unauthenticated users redirected from admin pages', async ({ page, frontendServer }) => {
    // Navigate to admin blog list without authentication
    await page.goto(`${frontendServer.url}/admin/blog`)

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)

    // Navigate to create page without authentication
    await page.goto(`${frontendServer.url}/admin/blog/new`)

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('public blog pages accessible without authentication', async ({ page, backendApp, frontendServer, authenticatedPage }) => {
    // Create a published post
    const cookieHeader = getCookieHeader(await authenticatedPage.page.context().cookies())

    const response = await fetch(`${backendApp.address}/api/admin/blog/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({
        title: 'Public Test Post',
        content: 'Public content',
        status: 'published',
      }),
    })
    expect(response.ok).toBeTruthy()
    const post = await response.json()

    // Navigate to blog list without authentication
    await page.goto(`${frontendServer.url}/blog`)
    await expect(page.getByRole('heading', { name: 'Blog', level: 1 })).toBeVisible()

    // Navigate to post detail without authentication
    await page.goto(`${frontendServer.url}/blog/${post.id}`)
    await expect(page.getByRole('heading', { name: 'Public Test Post' }).first()).toBeVisible()
  })
})
