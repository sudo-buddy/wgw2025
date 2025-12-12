import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    // Check if h1 or picture is already inside a hero block
    if (h1.closest('.hero') || picture.closest('.hero')) {
      return; // Don't create a duplicate hero block
    }
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto block `*/fragments/*` references
    const fragments = main.querySelectorAll('a[href*="/fragments/"]');
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(frag.firstElementChild);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
// Fallback: Inject a custom A/B Testing button into Sidekick's visible plugins container
(function bootstrapCustomSidekickButton() {
  const BUTTON_SELECTOR = '[data-sk-plugin="experimentation-fallback"]';

  function createButton() {
    const button = document.createElement('sk-action-button');

    // Match attributes from the native publish button
    button.setAttribute('quiet', '');
    button.setAttribute('slot', '');
    button.setAttribute('dir', 'ltr');
    button.setAttribute('role', 'button');
    button.setAttribute('focusable', '');
    button.setAttribute('tabindex', '0');
    button.classList.add('publish', 'experimentation'); // optional; native uses "publish", "edit", etc.

    const label = 'A/B Testing';
    button.textContent = label; // visible label (same pattern as "Publish")
    button.title = label; // tooltip
    button.setAttribute('aria-label', label);

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('A/B Testing sk-action-button clicked (fallback)');
      // TODO: replace this with your experimentation rail / logic
      alert('A/B Testing button invoked (fallback)!');
    });

    return button;
  }

  /**
   * Recursively search inside a root (including its shadow roots and slots)
   * for an element matching the selector.
   */
  function deepQuerySelector(root, selector, depth = 0, maxDepth = 10) {
    if (!root || depth > maxDepth) return null;

    // Try in this root directly
    const direct = root.querySelector(selector);
    if (direct) return direct;

    // Explore shadow roots on child elements
    const elements = Array.from(root.querySelectorAll('*'));
    return elements.reduce((result, el) => {
      if (result) return result;
      // If this element has a shadowRoot, search within it
      if (el.shadowRoot) {
        const foundInShadow = deepQuerySelector(el.shadowRoot, selector, depth + 1, maxDepth);
        if (foundInShadow) return foundInShadow;
      }
      // If this is a slot, search assigned nodes as well
      if (el.tagName === 'SLOT') {
        const assigned = el.assignedNodes({ flatten: true }) || [];
        return assigned.reduce((slotResult, node) => {
          if (slotResult) return slotResult;
          if (node.nodeType === Node.ELEMENT_NODE) {
            const foundInSlot = deepQuerySelector(node, selector, depth + 1, maxDepth);
            if (foundInSlot) return foundInSlot;
          }
          return null;
        }, null);
      }
      return null;
    }, null);
  }

  function addExperimentationButton(sk) {
    if (!sk) return;

    const root = sk.shadowRoot;
    if (!root) {
      console.warn('Sidekick shadowRoot not found');
      return;
    }

    // Recursively search for the plugins container anywhere inside Sidekick's shadow tree
    const pluginsContainer = deepQuerySelector(root, '.action-group.plugins-container');
    if (!pluginsContainer) {
      console.warn('plugins-container not found in Sidekick shadow tree (fallback)');
      console.log('Sidekick shadow root snapshot:', root.innerHTML.slice(0, 800));
      return;
    }

    // Avoid duplicates
    if (pluginsContainer.querySelector(BUTTON_SELECTOR)) {
      return;
    }

    const button = createButton();
    pluginsContainer.appendChild(button);
    console.log('Custom A/B Testing button added to Sidekick plugins-container (fallback)');
  }

  function init() {
    const sk = document.querySelector('aem-sidekick');
    if (!sk) {
      console.warn('aem-sidekick element not found for fallback button');
      return;
    }

    // Give Sidekick time to fully render internally
    setTimeout(() => addExperimentationButton(sk), 1000);
  }

  const sk = document.querySelector('aem-sidekick');
  if (sk) {
    init();
  } else {
    document.addEventListener('sidekick-ready', init, { once: true });
  }
}());
