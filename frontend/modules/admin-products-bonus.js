export function createAdminProductsBonusController(deps = {}) {
  const {
    PRODUCT_SVG_DIMENSION_WARN_PX,
    PRODUCT_SVG_MAX_SIZE_BYTES,
    MATERIAL_RULES_DISALLOWED_PRODUCT_IDS_UPPER,
    MATERIAL_RULES_SORT_STEP,
    authState,
    bonusAdminState,
    canAccessDesktopAdminUi,
    canAccessTechnicianBonusView,
    canUsePricingAdminControls,
    closeAccessibleModal,
    closeAllModals,
    collapseDiagramToolbarIfExpanded,
    escapeHtml,
    fetchQuickQuoterCatalog,
    formatCurrency,
    getAuthHeaders,
    getVisibleViewId,
    handleAuthFailure,
    isAdminRole,
    isDesktopViewport,
    layoutState,
    loadPanelProducts,
    markPanelProductsDirty,
    materialRulesDragState,
    materialRulesState,
    normalizeAppRole,
    openAccessibleModal,
    setQuoteEditMode,
    showAppAlert,
    showAppConfirm,
    showMessage,
    switchView,
    technicianBonusState,
    updateSavePricingButtonState,
    uploadProductSVG,
    userPermissionsState,
  } = deps;

  let productsViewInitialized = false;
  let currentEditingProduct = null;
  let openProductModal = null;
  let allLibraryProducts = [];

function initProductsView() {
  if (productsViewInitialized) return;
  productsViewInitialized = true;

  const btnBackToCanvas = document.getElementById('btnBackToCanvas');
  if (btnBackToCanvas) {
    btnBackToCanvas.addEventListener('click', () => switchView('view-canvas'));
  }

  const productLibrarySearch = document.getElementById('productLibrarySearch');
  const productFilterProfile = document.getElementById('productFilterProfile');
  if (productLibrarySearch) {
    productLibrarySearch.addEventListener('input', () => filterLibraryGrid());
  }
  if (productFilterProfile) {
    productFilterProfile.addEventListener('change', () => filterLibraryGrid());
  }

  // Legacy: localStorage no longer used; Supabase is source of truth
  // try {
  //   const stored = localStorage.getItem('custom_products');
  //   localProducts = stored ? JSON.parse(stored) : [];
  // } catch (_) {
  //   localProducts = [];
  // }

  const productModal = document.getElementById('productModal');
  const productCardNew = document.getElementById('productCardNew');
  const dropZone = document.getElementById('dropZone');
  const dropZoneContent = dropZone?.querySelector('.drop-zone-content');
  const filePreview = document.getElementById('filePreview');
  const previewSvgContainer = document.getElementById('previewSvgContainer');
  const productModalFileInput = document.getElementById('productModalFileInput');
  const btnRemoveFile = document.getElementById('btnRemoveFile');
  const productForm = document.getElementById('productForm');
  const inputProductId = document.getElementById('inputProductId');
  const inputProductName = document.getElementById('inputProductName');
  const inputProductCategory = document.getElementById('inputProductCategory');
  const inputItemNumber = document.getElementById('inputItemNumber');
  const inputCostPrice = document.getElementById('inputCostPrice');
  const inputMarkupPercentage = document.getElementById('inputMarkupPercentage');
  const inputPriceExcGst = document.getElementById('inputPriceExcGst');
  const inputUnit = document.getElementById('inputUnit');
  const inputProfile = document.getElementById('inputProfile');
  const inputThumbnailUrl = document.getElementById('inputThumbnailUrl');
  const inputDiagramUrl = document.getElementById('inputDiagramUrl');
  const inputServicem8Uuid = document.getElementById('inputServicem8Uuid');
  const btnCancelProduct = document.getElementById('btnCancelProduct');
  const btnSaveProduct = document.getElementById('btnSaveProduct');
  const btnArchiveProduct = document.getElementById('btnArchiveProduct');
  const isMobileSvgUploadDisabled =
    typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && (window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches);

  function notifyMobileSvgUploadDisabled() {
    showMessage('SVG product upload is desktop-only in this MVP.', 'info');
  }

  if (isMobileSvgUploadDisabled && productCardNew) {
    productCardNew.hidden = true;
  }

  let pendingSvgContent = null;
  let pendingSvgFile = null;

  function slugFromName(name) {
    return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function resetProductForm() {
    currentEditingProduct = null;
    pendingSvgContent = null;
    pendingSvgFile = null;
    if (productModalSignInPrompt) productModalSignInPrompt.hidden = true;
    if (productForm) { productForm.style.pointerEvents = ''; productForm.style.opacity = ''; }
    if (previewSvgContainer) previewSvgContainer.innerHTML = '';
    if (filePreview) filePreview.hidden = true;
    if (dropZoneContent) dropZoneContent.hidden = false;
    if (inputProductId) inputProductId.value = '';
    if (inputProductName) inputProductName.value = '';
    if (inputProductCategory) inputProductCategory.value = '';
    if (inputItemNumber) inputItemNumber.value = '';
    if (inputCostPrice) inputCostPrice.value = '';
    if (inputMarkupPercentage) inputMarkupPercentage.value = '30';
    if (inputPriceExcGst) inputPriceExcGst.value = '';
    if (inputUnit) inputUnit.value = 'each';
    if (inputProfile) inputProfile.value = '';
    if (inputThumbnailUrl) inputThumbnailUrl.value = '';
    if (inputDiagramUrl) inputDiagramUrl.value = '';
    if (inputServicem8Uuid) inputServicem8Uuid.value = '';
    if (btnSaveProduct) btnSaveProduct.disabled = true;
    if (productModalFileInput) productModalFileInput.value = '';
    if (btnArchiveProduct) {
      btnArchiveProduct.hidden = true;
      btnArchiveProduct.removeAttribute('data-action');
      btnArchiveProduct.classList.remove('btn-archive--destructive');
    }
  }

  function validateProductSvgFile(file) {
    if (!file) return { valid: false, message: 'No file selected.' };
    const isSvgType = file.type === 'image/svg+xml';
    const isSvgExt = (file.name || '').toLowerCase().endsWith('.svg');
    if (!isSvgType && !isSvgExt) {
      return { valid: false, message: 'Only SVG files are allowed.' };
    }
    if (file.size > PRODUCT_SVG_MAX_SIZE_BYTES) {
      return { valid: false, message: 'File is too large. Please upload an SVG under 2MB.' };
    }
    return { valid: true };
  }

  function clearProductFileInput() {
    pendingSvgContent = null;
    pendingSvgFile = null;
    if (previewSvgContainer) previewSvgContainer.innerHTML = '';
    if (filePreview) filePreview.hidden = true;
    if (dropZoneContent) dropZoneContent.hidden = false;
    if (productModalFileInput) productModalFileInput.value = '';
    if (!currentEditingProduct && btnSaveProduct) btnSaveProduct.disabled = true;
  }

  function getSvgDimensions(svgContent) {
    if (!svgContent || typeof svgContent !== 'string') return null;
    const wMatch = svgContent.match(/\bwidth\s*=\s*["']?([0-9.]+)/i);
    const hMatch = svgContent.match(/\bheight\s*=\s*["']?([0-9.]+)/i);
    let w = wMatch ? parseFloat(wMatch[1]) : null;
    let h = hMatch ? parseFloat(hMatch[1]) : null;
    if ((w == null || h == null) && svgContent.includes('viewBox')) {
      const vbMatch = svgContent.match(/viewBox\s*=\s*["']?\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)/i);
      if (vbMatch) {
        const vw = parseFloat(vbMatch[3]);
        const vh = parseFloat(vbMatch[4]);
        if (w == null) w = vw;
        if (h == null) h = vh;
      }
    }
    if (w != null && h != null && !Number.isNaN(w) && !Number.isNaN(h)) return { width: w, height: h };
    return null;
  }

  function setProductFile(svgContent, file) {
    if (!svgContent || !svgContent.trim().startsWith('<')) {
      if (btnSaveProduct) btnSaveProduct.disabled = true;
      return;
    }
    pendingSvgContent = svgContent;
    pendingSvgFile = file || null;
    if (previewSvgContainer) previewSvgContainer.innerHTML = svgContent;
    if (filePreview) filePreview.hidden = false;
    if (dropZoneContent) dropZoneContent.hidden = true;
    if (btnSaveProduct) btnSaveProduct.disabled = false;
  }

  function showDiagramPreviewFromUrl(url) {
    if (!previewSvgContainer) return;
    previewSvgContainer.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.maxHeight = '120px';
    img.style.objectFit = 'contain';
    previewSvgContainer.appendChild(img);
    if (filePreview) filePreview.hidden = false;
    if (dropZoneContent) dropZoneContent.hidden = true;
    if (btnSaveProduct) btnSaveProduct.disabled = false;
  }

  const productModalTitle = document.getElementById('productModalTitle');

  const productModalSignInPrompt = document.getElementById('productModalSignInPrompt');
  const btnSignInFromProductModal = document.getElementById('btnSignInFromProductModal');

  openProductModal = (product = null) => {
    if (!product) {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      resetProductForm();
      if (productModalTitle) productModalTitle.textContent = 'Add New Product';
      if (btnSaveProduct) {
        btnSaveProduct.textContent = 'Create Product';
        btnSaveProduct.disabled = true;
      }
      if (btnArchiveProduct) btnArchiveProduct.hidden = true;
      if (!authState.token) {
        if (productModalSignInPrompt) productModalSignInPrompt.hidden = false;
        if (productForm) productForm.style.pointerEvents = 'none';
        if (productForm) productForm.style.opacity = '0.5';
      } else {
        if (productModalSignInPrompt) productModalSignInPrompt.hidden = true;
        if (productForm) productForm.style.pointerEvents = '';
        if (productForm) productForm.style.opacity = '';
      }
      collapseDiagramToolbarIfExpanded();
      openAccessibleModal('productModal', { triggerEl: document.getElementById('productCardNew') || document.activeElement });
      return;
    }
    if (productModalSignInPrompt) productModalSignInPrompt.hidden = true;
    if (productForm) { productForm.style.pointerEvents = ''; productForm.style.opacity = ''; }
    currentEditingProduct = product;
    pendingSvgContent = null;
    pendingSvgFile = null;
    if (previewSvgContainer) previewSvgContainer.innerHTML = '';
    if (productModalFileInput) productModalFileInput.value = '';
    if (productModalTitle) productModalTitle.textContent = 'Edit Product';
    if (btnSaveProduct) {
      btnSaveProduct.textContent = 'Save Changes';
      btnSaveProduct.disabled = false;
    }
    if (inputProductId) inputProductId.value = product.id || '';
    if (inputProductName) inputProductName.value = product.name || '';
    if (inputProductCategory) inputProductCategory.value = product.category || '';
    if (inputItemNumber) inputItemNumber.value = product.item_number || '';
    if (inputCostPrice) inputCostPrice.value = product.cost_price != null ? String(product.cost_price) : '';
    if (inputMarkupPercentage) inputMarkupPercentage.value = product.markup_percentage != null ? String(product.markup_percentage) : '30';
    if (inputPriceExcGst) inputPriceExcGst.value = product.price_exc_gst != null ? String(product.price_exc_gst) : '';
    if (inputUnit) inputUnit.value = product.unit || 'each';
    if (inputProfile) inputProfile.value = product.profile || '';
    if (inputThumbnailUrl) inputThumbnailUrl.value = product.thumbnail_url || product.thumbnailUrl || '';
    if (inputDiagramUrl) inputDiagramUrl.value = product.diagram_url || product.diagramUrl || '';
    if (inputServicem8Uuid) inputServicem8Uuid.value = product.servicem8_material_uuid || '';
    const diagramUrl = product.diagram_url || product.diagramUrl || '';
    if (diagramUrl) showDiagramPreviewFromUrl(diagramUrl);
    if (btnArchiveProduct) {
      btnArchiveProduct.hidden = false;
      const isArchived = product.active === false;
      btnArchiveProduct.textContent = isArchived ? 'Unarchive' : 'Archive';
      btnArchiveProduct.setAttribute('data-action', isArchived ? 'unarchive' : 'archive');
      btnArchiveProduct.classList.toggle('btn-archive--destructive', !isArchived);
    }
    collapseDiagramToolbarIfExpanded();
    openAccessibleModal('productModal', { triggerEl: document.activeElement });
  };

  if (btnArchiveProduct) {
    btnArchiveProduct.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!currentEditingProduct || !authState.supabase) return;
      const action = btnArchiveProduct.getAttribute('data-action');
      const newActive = action === 'unarchive';
      const msg = newActive
        ? 'Unarchive this product? It will appear in the Canvas sidebar again.'
        : 'Archive this product? It will no longer appear in the Canvas sidebar.';
      const confirmed = await showAppConfirm(msg, {
        title: newActive ? 'Unarchive product' : 'Archive product',
        confirmText: newActive ? 'Unarchive' : 'Archive',
        destructive: !newActive,
        triggerEl: btnArchiveProduct,
      });
      if (!confirmed) return;
      btnArchiveProduct.disabled = true;
      try {
        const { error } = await authState.supabase
          .from('products')
          .update({ active: newActive })
          .eq('id', currentEditingProduct.id);
        if (error) throw error;
        closeAccessibleModal('productModal');
        resetProductForm();
        await renderProductLibrary();
        markPanelProductsDirty();
        await loadPanelProducts({ force: true });
      } catch (err) {
        await showAppAlert(err.message || 'Failed to archive product', {
          title: 'Archive failed',
          triggerEl: btnArchiveProduct,
        });
      } finally {
        btnArchiveProduct.disabled = false;
      }
    });
  }

  if (productCardNew && productModal) {
    productCardNew.addEventListener('click', () => {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      if (!authState.token) {
        switchView('view-login');
        showMessage('Sign in to add products.');
        return;
      }
      openProductModal(null);
    });
  }

  if (btnCancelProduct && productModal) {
    btnCancelProduct.addEventListener('click', () => {
      closeAccessibleModal('productModal');
      resetProductForm();
    });
  }

  if (dropZone) {
    dropZone.addEventListener('click', (e) => {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      if (e.target === productModalFileInput || e.target.closest('.file-preview')) return;
      productModalFileInput?.click();
    });
    dropZone.addEventListener('dragover', (e) => {
      if (isMobileSvgUploadDisabled) return;
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
      if (isMobileSvgUploadDisabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const validation = validateProductSvgFile(file);
      if (!validation.valid) {
        showAppAlert(validation.message, { title: 'Invalid SVG file', triggerEl: dropZone });
        clearProductFileInput();
        return;
      }
      pendingSvgFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        const svgContent = reader.result;
        const dims = getSvgDimensions(svgContent);
        if (dims && (dims.width > PRODUCT_SVG_DIMENSION_WARN_PX || dims.height > PRODUCT_SVG_DIMENSION_WARN_PX)) {
          showAppAlert('This SVG has very large dimensions and may affect performance. We recommend resizing it.', {
            title: 'Large SVG warning',
            triggerEl: dropZone,
          });
        }
        setProductFile(svgContent, file);
      };
      reader.readAsText(file);
    });
  }

  if (productModalFileInput) {
    productModalFileInput.addEventListener('change', () => {
      if (isMobileSvgUploadDisabled) {
        notifyMobileSvgUploadDisabled();
        clearProductFileInput();
        return;
      }
      const file = productModalFileInput.files?.[0];
      if (!file) return;
      const validation = validateProductSvgFile(file);
      if (!validation.valid) {
        showAppAlert(validation.message, { title: 'Invalid SVG file', triggerEl: productModalFileInput });
        clearProductFileInput();
        return;
      }
      pendingSvgFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        const svgContent = reader.result;
        const dims = getSvgDimensions(svgContent);
        if (dims && (dims.width > PRODUCT_SVG_DIMENSION_WARN_PX || dims.height > PRODUCT_SVG_DIMENSION_WARN_PX)) {
          showAppAlert('This SVG has very large dimensions and may affect performance. We recommend resizing it.', {
            title: 'Large SVG warning',
            triggerEl: productModalFileInput,
          });
        }
        setProductFile(svgContent, file);
      };
      reader.readAsText(file);
    });
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', (e) => {
      e.preventDefault();
      pendingSvgContent = null;
      pendingSvgFile = null;
      if (previewSvgContainer) previewSvgContainer.innerHTML = '';
      if (filePreview) filePreview.hidden = true;
      if (dropZoneContent) dropZoneContent.hidden = false;
      if (productModalFileInput) productModalFileInput.value = '';
      if (!currentEditingProduct && btnSaveProduct) btnSaveProduct.disabled = true;
    });
  }

  if (btnSignInFromProductModal) {
    btnSignInFromProductModal.addEventListener('click', () => {
      closeAccessibleModal('productModal');
      switchView('view-login');
    });
  }

  if (productForm) {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isMobileSvgUploadDisabled && pendingSvgFile) {
        notifyMobileSvgUploadDisabled();
        return;
      }
      if (!authState.token) {
        showMessage('Sign in to add products.');
        switchView('view-login');
        closeAccessibleModal('productModal');
        return;
      }
      const name = (inputProductName?.value || '').trim();
      const category = (inputProductCategory?.value || '').trim();
      const hasDiagram = pendingSvgContent || (currentEditingProduct && (currentEditingProduct.diagram_url || currentEditingProduct.diagramUrl));
      if (!name || !category) return;
      if (!hasDiagram) {
        await showAppAlert('Please add a diagram (drop an SVG file or ensure the product has a diagram URL).', {
          title: 'Diagram required',
          triggerEl: btnSaveProduct,
        });
        return;
      }
      if (!pendingSvgFile && !currentEditingProduct) {
        await showAppAlert('Please select an SVG file to upload', {
          title: 'SVG required',
          triggerEl: productModalFileInput,
        });
        return;
      }
      if (!authState.supabase) {
        await showAppAlert('Supabase is not configured', {
          title: 'Configuration required',
          triggerEl: btnSaveProduct,
        });
        return;
      }
      if (btnSaveProduct) btnSaveProduct.disabled = true;
      try {
        let diagramUrl;
        if (pendingSvgFile) {
          diagramUrl = await uploadProductSVG(pendingSvgFile);
        } else if (currentEditingProduct) {
          diagramUrl = currentEditingProduct.diagram_url || currentEditingProduct.diagramUrl || '';
        } else {
          throw new Error('No diagram available');
        }
        const rawId = (inputProductId?.value || '').trim();
        const id = rawId || (slugFromName(name) || 'product') + '-' + Date.now();
        const costVal = (inputCostPrice?.value || '').trim();
        const markupVal = (inputMarkupPercentage?.value || '').trim();
        const priceExcVal = (inputPriceExcGst?.value || '').trim();
        const productData = {
          name,
          category,
          item_number: (inputItemNumber?.value || '').trim() || null,
          cost_price: costVal === '' ? null : (parseFloat(costVal) || null),
          markup_percentage: markupVal === '' ? null : (parseFloat(markupVal) ?? 30),
          price_exc_gst: priceExcVal === '' ? null : (parseFloat(priceExcVal) || null),
          unit: (inputUnit?.value || 'each').trim(),
          profile: (inputProfile?.value || '').trim() || null,
          active: currentEditingProduct ? (currentEditingProduct.active !== false) : true,
          thumbnail_url: (inputThumbnailUrl?.value || '').trim() || diagramUrl,
          diagram_url: diagramUrl,
          servicem8_material_uuid: (inputServicem8Uuid?.value || '').trim() || null,
        };
        if (currentEditingProduct) {
          const { error } = await authState.supabase
            .from('products')
            .update(productData)
            .eq('id', currentEditingProduct.id);
          if (error) throw error;
        } else {
          productData.id = id;
          const { error } = await authState.supabase.from('products').insert([productData]);
          if (error) throw error;
        }
        closeAccessibleModal('productModal');
        resetProductForm();
        await renderProductLibrary();
        markPanelProductsDirty();
        await loadPanelProducts({ force: true });
      } catch (err) {
        await showAppAlert(err.message || 'Failed to save product', {
          title: 'Save product failed',
          triggerEl: btnSaveProduct,
        });
      } finally {
        if (btnSaveProduct) btnSaveProduct.disabled = false;
      }
    });
  }

  renderProductLibrary();
}

function renderLibraryGrid(list) {
  const grid = document.getElementById('productsPageGrid');
  const newCard = document.getElementById('productCardNew');
  if (!grid) return;
  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }
  if (newCard) grid.appendChild(newCard);

  (list || []).forEach((p) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    if (p.active === false) card.classList.add('product-card-archived');
    card.setAttribute('data-product-id', String(p.id));
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Edit product: ${p.name || 'Unnamed'}`);
    const previewWrap = document.createElement('div');
    previewWrap.className = 'product-card-preview';
    if (p.diagram_url) {
      const img = document.createElement('img');
      img.src = p.diagram_url;
      img.alt = p.name || '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxHeight = '120px';
      img.style.objectFit = 'contain';
      previewWrap.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'product-card-name';
    nameEl.textContent = p.name || 'Unnamed';
    card.appendChild(previewWrap);
    card.appendChild(nameEl);
    if (p.active === false) {
      const badge = document.createElement('span');
      badge.className = 'product-card-archived-badge';
      badge.textContent = 'Archived';
      card.appendChild(badge);
    }
    card.addEventListener('click', () => {
      if (openProductModal) openProductModal(p);
    });
    grid.appendChild(card);
  });
}

function filterLibraryGrid() {
  if (!allLibraryProducts || !Array.isArray(allLibraryProducts)) return;
  const searchEl = document.getElementById('productLibrarySearch');
  const profileEl = document.getElementById('productFilterProfile');
  const searchTerm = (searchEl?.value || '').trim().toLowerCase();
  const profileVal = (profileEl?.value || '').trim();
  const filtered = allLibraryProducts.filter((p) => {
    const nameMatch = !searchTerm || (p.name || '').toLowerCase().includes(searchTerm);
    const profileMatch = !profileVal || (p.profile || '') === profileVal;
    return nameMatch && profileMatch;
  });
  renderLibraryGrid(filtered);
}

async function renderProductLibrary() {
  const supabase = authState.supabase;
  if (!supabase) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Failed to fetch products:', error);
    return;
  }

  const list = products || [];
  list.sort((a, b) => {
    const aActive = a.active !== false;
    const bActive = b.active !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return 0;
  });
  allLibraryProducts = list;
  filterLibraryGrid();
}

function setUserPermissionsStatus(message, tone = 'info') {
  const el = document.getElementById('userPermissionsStatus');
  if (!el) return;
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('permissions-status--error', 'permissions-status--success');
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('permissions-status--error', tone === 'error');
  el.classList.toggle('permissions-status--success', tone === 'success');
}

function updateUserPermissionsMenuVisibility() {
  const menuItem = document.getElementById('menuItemUserPermissions');
  if (!menuItem) return;
  menuItem.hidden = !canAccessDesktopAdminUi();
}

function updateMaterialRulesMenuVisibility() {
  const menuItem = document.getElementById('menuItemMaterialRules');
  if (!menuItem) return;
  menuItem.hidden = !canAccessDesktopAdminUi();
}

function updateTechnicianBonusMenuVisibility() {
  const menuItem = document.getElementById('menuItemTechnicianBonus');
  if (!menuItem) return;
  menuItem.hidden = !canAccessTechnicianBonusView();
}

function updateBonusAdminMenuVisibility() {
  const menuItem = document.getElementById('menuItemBonusAdmin');
  if (!menuItem) return;
  menuItem.hidden = !canAccessDesktopAdminUi();
}

function renderBonusAdminPeriodSelect() {
  const select = document.getElementById('bonusAdminPeriodSelect');
  const emptyEl = document.getElementById('bonusAdminPeriodsEmpty');
  if (!select || !emptyEl) return;

  const periods = Array.isArray(bonusAdminState.periods) ? bonusAdminState.periods : [];
  const loading = bonusAdminState.loading;

  if (loading && periods.length === 0) {
    emptyEl.textContent = 'Loading…';
    emptyEl.hidden = false;
    select.hidden = true;
    return;
  }

  if (periods.length === 0) {
    emptyEl.textContent = 'No periods. Create one.';
    emptyEl.hidden = false;
    select.hidden = true;
    bonusAdminState.selectedPeriodId = null;
    return;
  }

  emptyEl.hidden = true;
  select.hidden = false;
  select.disabled = false;

  const selectedId = bonusAdminState.selectedPeriodId || '';
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a period…';
  select.appendChild(placeholder);
  periods.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = String(p.id || '');
    opt.textContent = String(p.period_name || p.id || '—');
    select.appendChild(opt);
  });
  if (selectedId && periods.some((p) => String(p.id) === selectedId)) {
    select.value = selectedId;
  } else {
    select.value = '';
    bonusAdminState.selectedPeriodId = null;
  }

  const editPeriodBtn = document.getElementById('btnBonusAdminEditPeriod');
  if (editPeriodBtn) {
    editPeriodBtn.hidden = !bonusAdminState.selectedPeriodId;
  }
}

function renderBonusAdminSummaryAndBreakdown() {
  const summarySection = document.getElementById('bonusAdminSummarySection');
  const breakdownSection = document.getElementById('bonusAdminBreakdownSection');
  const periodId = bonusAdminState.selectedPeriodId;
  const loading = bonusAdminState.summaryLoading;
  const summary = bonusAdminState.summary;
  const breakdown = bonusAdminState.breakdown;

  if (!summarySection || !breakdownSection) return;

  if (!periodId) {
    summarySection.hidden = true;
    breakdownSection.hidden = true;
    return;
  }

  summarySection.hidden = false;
  breakdownSection.hidden = false;
  const potEl = document.getElementById('bonusAdminSummaryPot');
  const eligibleEl = document.getElementById('bonusAdminSummaryEligibleCount');
  const callbackEl = document.getElementById('bonusAdminSummaryCallbackTotal');
  const tbody = document.getElementById('bonusAdminBreakdownTableBody');

  if (loading) {
    if (potEl) potEl.textContent = 'Loading…';
    if (eligibleEl) eligibleEl.textContent = '—';
    if (callbackEl) callbackEl.textContent = '—';
    if (tbody) tbody.innerHTML = '';
    return;
  }

  if (potEl) potEl.textContent = summary ? formatCurrency(summary.total_team_pot ?? 0) : '—';
  if (eligibleEl) eligibleEl.textContent = summary ? String(summary.eligible_job_count ?? 0) : '—';
  if (callbackEl) callbackEl.textContent = summary ? formatCurrency(summary.callback_cost_total ?? 0) : '—';

  if (!tbody) return;
  const rows = Array.isArray(bonusAdminState.breakdown) ? bonusAdminState.breakdown : [];
  tbody.innerHTML = rows.map((row) => {
    const name = String(row.display_name || row.technician_id || '—').trim() || '—';
    const gp = Number(row.gp_contributed);
    const share = Number(row.share_of_team_pot);
    const payout = Number(row.expected_payout);
    return `<tr><td>${escapeHtml(name)}</td><td>${formatCurrency(gp)}</td><td>${formatCurrency(share)}</td><td>${formatCurrency(payout)}</td></tr>`;
  }).join('');
}

function renderBonusAdminJobsList() {
  const section = document.getElementById('bonusAdminJobsSection');
  const tbody = document.getElementById('bonusAdminJobsTableBody');
  if (!section || !tbody) return;

  const periodId = bonusAdminState.selectedPeriodId;
  const loading = bonusAdminState.summaryLoading;
  const jobs = Array.isArray(bonusAdminState.jobs) ? bonusAdminState.jobs : [];

  if (!periodId || loading) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  tbody.innerHTML = jobs.map((job) => {
    const id = String(job.id || '').trim();
    const identifier = String(job.servicem8_job_id || job.id || '—').trim() || '—';
    const status = String(job.status || '—').trim() || '—';
    const jobGp = Number(job.job_gp);
    const personnel = Array.isArray(job.personnel) ? job.personnel : [];
    const personnelLabel = personnel.length === 0 ? '0' : String(personnel.length);
    return `<tr data-job-id="${escapeHtml(id)}">
      <td>${escapeHtml(identifier)}</td>
      <td>${escapeHtml(status)}</td>
      <td>${formatCurrency(jobGp)}</td>
      <td>${escapeHtml(personnelLabel)}</td>
      <td>
        <button type="button" class="bonus-admin-edit-job-btn" data-job-id="${escapeHtml(id)}" aria-label="Edit job ${escapeHtml(identifier)}">Edit job</button>
        <button type="button" class="bonus-admin-edit-personnel-btn" data-job-id="${escapeHtml(id)}" data-job-identifier="${escapeHtml(identifier)}" aria-label="Edit personnel for job ${escapeHtml(identifier)}">Edit personnel</button>
      </td>
    </tr>`;
  }).join('');

  section.querySelectorAll('.bonus-admin-edit-job-btn').forEach((btn) => {
    if (btn.dataset.bonusAdminBound) return;
    btn.dataset.bonusAdminBound = 'true';
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-job-id');
      if (!jobId) return;
      openBonusAdminEditJobModal(jobId);
    });
  });
  section.querySelectorAll('.bonus-admin-edit-personnel-btn').forEach((btn) => {
    if (btn.dataset.bonusAdminBound) return;
    btn.dataset.bonusAdminBound = 'true';
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-job-id');
      const jobIdentifier = btn.getAttribute('data-job-identifier') || '';
      if (!jobId) return;
      openBonusAdminEditPersonnelModal(jobId, jobIdentifier);
    });
  });
}

let bonusAdminEditJobId = null;

function populateBonusAdminEditJobForm(job) {
  if (!job) return;
  const statusEl = document.getElementById('bonusAdminEditJobStatus');
  const isCallbackEl = document.getElementById('bonusAdminEditJobIsCallback');
  const callbackReasonEl = document.getElementById('bonusAdminEditJobCallbackReason');
  const callbackCostEl = document.getElementById('bonusAdminEditJobCallbackCost');
  const standardPartsEl = document.getElementById('bonusAdminEditJobStandardPartsRuns');
  const sellerFaultPartsEl = document.getElementById('bonusAdminEditJobSellerFaultPartsRuns');
  const missedMaterialsEl = document.getElementById('bonusAdminEditJobMissedMaterialsCost');
  const isUpsellEl = document.getElementById('bonusAdminEditJobIsUpsell');
  if (statusEl) statusEl.value = job.status === 'verified' || job.status === 'processed' ? job.status : 'draft';
  if (isCallbackEl) isCallbackEl.checked = !!job.is_callback;
  if (callbackReasonEl) callbackReasonEl.value = String(job.callback_reason || '').trim();
  if (callbackCostEl) callbackCostEl.value = Number(job.callback_cost) >= 0 ? Number(job.callback_cost) : 0;
  if (standardPartsEl) standardPartsEl.value = Math.max(0, parseInt(job.standard_parts_runs, 10) || 0);
  if (sellerFaultPartsEl) sellerFaultPartsEl.value = Math.max(0, parseInt(job.seller_fault_parts_runs, 10) || 0);
  if (missedMaterialsEl) missedMaterialsEl.value = Number(job.missed_materials_cost) >= 0 ? Number(job.missed_materials_cost) : 0;
  if (isUpsellEl) isUpsellEl.checked = !!job.is_upsell;
}

function getBonusAdminEditJobFormBody() {
  const statusEl = document.getElementById('bonusAdminEditJobStatus');
  const isCallbackEl = document.getElementById('bonusAdminEditJobIsCallback');
  const callbackReasonEl = document.getElementById('bonusAdminEditJobCallbackReason');
  const callbackCostEl = document.getElementById('bonusAdminEditJobCallbackCost');
  const standardPartsEl = document.getElementById('bonusAdminEditJobStandardPartsRuns');
  const sellerFaultPartsEl = document.getElementById('bonusAdminEditJobSellerFaultPartsRuns');
  const missedMaterialsEl = document.getElementById('bonusAdminEditJobMissedMaterialsCost');
  const isUpsellEl = document.getElementById('bonusAdminEditJobIsUpsell');
  const body = {};
  if (statusEl) body.status = statusEl.value || 'draft';
  if (isCallbackEl) body.is_callback = isCallbackEl.checked;
  if (callbackReasonEl) body.callback_reason = callbackReasonEl.value.trim() || null;
  if (callbackCostEl) body.callback_cost = Math.max(0, parseFloat(callbackCostEl.value) || 0);
  if (standardPartsEl) body.standard_parts_runs = Math.max(0, parseInt(standardPartsEl.value, 10) || 0);
  if (sellerFaultPartsEl) body.seller_fault_parts_runs = Math.max(0, parseInt(sellerFaultPartsEl.value, 10) || 0);
  if (missedMaterialsEl) body.missed_materials_cost = Math.max(0, parseFloat(missedMaterialsEl.value) || 0);
  if (isUpsellEl) body.is_upsell = isUpsellEl.checked;
  return body;
}

async function openBonusAdminEditJobModal(jobId) {
  if (!jobId || !canAccessDesktopAdminUi()) return;
  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const errorEl = document.getElementById('bonusAdminEditJobError');
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }

  try {
    const resp = await fetch(`/api/bonus/job-performance/${encodeURIComponent(jobId)}`, { headers: { ...getAuthHeaders() } });
    if (handleAuthFailure(resp)) return;
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      showMessage(typeof data?.detail === 'string' ? data.detail : 'Failed to load job.', 'error');
      return;
    }
    bonusAdminEditJobId = jobId;
    populateBonusAdminEditJobForm(data);
    openAccessibleModal('bonusAdminEditJobModal', { triggerEl });
  } catch (err) {
    showMessage(err?.message || 'Failed to load job.', 'error');
  }
}

async function saveBonusAdminEditJob() {
  const jobId = bonusAdminEditJobId;
  if (!jobId || !canAccessDesktopAdminUi()) return;
  const errorEl = document.getElementById('bonusAdminEditJobError');
  const saveBtn = document.getElementById('bonusAdminEditJobSaveBtn');
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  if (saveBtn) saveBtn.disabled = true;

  try {
    const body = getBonusAdminEditJobFormBody();
    const resp = await fetch(`/api/bonus/job-performance/${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (handleAuthFailure(resp)) return;
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = typeof data?.detail === 'string' ? data.detail : data?.detail?.msg || 'Failed to update job.';
      if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
      return;
    }
    closeAccessibleModal('bonusAdminEditJobModal', { restoreFocus: true });
    bonusAdminEditJobId = null;
    showMessage('Job updated.', 'success');
    void fetchBonusAdminSummaryAndBreakdown();
  } catch (err) {
    if (errorEl) { errorEl.textContent = err?.message || 'Failed to update job.'; errorEl.hidden = false; }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function fetchBonusAdminSummaryAndBreakdown() {
  const periodId = bonusAdminState.selectedPeriodId;
  if (!periodId || !canAccessDesktopAdminUi() || getVisibleViewId() !== 'view-bonus-admin') return;

  bonusAdminState.summaryLoading = true;
  bonusAdminState.summary = null;
  bonusAdminState.breakdown = null;
  bonusAdminState.jobs = [];
  renderBonusAdminSummaryAndBreakdown();
  renderBonusAdminJobsList();

  try {
    const [summaryResp, breakdownResp, jobsResp] = await Promise.all([
      fetch(`/api/bonus/admin/periods/${encodeURIComponent(periodId)}/summary`, { headers: { ...getAuthHeaders() } }),
      fetch(`/api/bonus/admin/periods/${encodeURIComponent(periodId)}/breakdown`, { headers: { ...getAuthHeaders() } }),
      fetch(`/api/bonus/admin/periods/${encodeURIComponent(periodId)}/jobs`, { headers: { ...getAuthHeaders() } }),
    ]);
    if (handleAuthFailure(summaryResp) || handleAuthFailure(breakdownResp) || handleAuthFailure(jobsResp)) return;
    const [summaryData, breakdownData, jobsData] = await Promise.all([
      summaryResp.json().catch(() => ({})),
      breakdownResp.json().catch(() => ({})),
      jobsResp.json().catch(() => ({})),
    ]);
    if (!summaryResp.ok) {
      showMessage(typeof summaryData?.detail === 'string' ? summaryData.detail : 'Failed to load summary.', 'error');
      return;
    }
    if (!breakdownResp.ok) {
      showMessage(typeof breakdownData?.detail === 'string' ? breakdownData.detail : 'Failed to load breakdown.', 'error');
      return;
    }
    if (!jobsResp.ok) {
      showMessage(typeof jobsData?.detail === 'string' ? jobsData.detail : 'Failed to load jobs.', 'error');
      return;
    }
    bonusAdminState.summary = summaryData;
    bonusAdminState.breakdown = breakdownData.breakdown ?? [];
    bonusAdminState.jobs = Array.isArray(jobsData?.jobs) ? jobsData.jobs : [];
    renderBonusAdminSummaryAndBreakdown();
    renderBonusAdminJobsList();
  } catch (err) {
    showMessage(err?.message || 'Failed to load summary and breakdown.', 'error');
  } finally {
    bonusAdminState.summaryLoading = false;
    renderBonusAdminSummaryAndBreakdown();
    renderBonusAdminJobsList();
  }
}

async function fetchBonusAdminPeriods() {
  if (!canAccessDesktopAdminUi()) return;
  if (getVisibleViewId() !== 'view-bonus-admin') return;

  bonusAdminState.loading = true;
  renderBonusAdminPeriodSelect();

  try {
    const resp = await fetch('/api/bonus/periods', { headers: { ...getAuthHeaders() } });
    if (handleAuthFailure(resp)) return;
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = typeof data?.detail === 'string' ? data.detail : data?.detail?.msg || 'Failed to load periods.';
      showMessage(msg, 'error');
      return;
    }
    const periods = Array.isArray(data?.periods) ? data.periods : [];
    bonusAdminState.periods = periods;
    const currentSelected = bonusAdminState.selectedPeriodId;
    const ids = new Set(periods.map((p) => String(p.id)));
    if (!currentSelected || !ids.has(currentSelected)) {
      bonusAdminState.selectedPeriodId = null;
    }
    renderBonusAdminPeriodSelect();
  } catch (err) {
    showMessage(err?.message || 'Failed to load periods.', 'error');
  } finally {
    bonusAdminState.loading = false;
    renderBonusAdminPeriodSelect();
  }
}

function initBonusAdminView() {
  const backBtn = document.getElementById('btnBonusAdminBackToCanvas');
  if (!backBtn || backBtn.dataset.bonusAdminBound) return;
  backBtn.dataset.bonusAdminBound = 'true';
  backBtn.addEventListener('click', () => {
    switchView('view-canvas', { triggerEl: backBtn });
  });

  const periodSelect = document.getElementById('bonusAdminPeriodSelect');
  if (periodSelect && !periodSelect.dataset.bonusAdminBound) {
    periodSelect.dataset.bonusAdminBound = 'true';
    periodSelect.addEventListener('change', () => {
      const value = periodSelect.value || '';
      bonusAdminState.selectedPeriodId = value || null;
      if (value) {
        void fetchBonusAdminSummaryAndBreakdown();
      } else {
        bonusAdminState.summary = null;
        bonusAdminState.breakdown = null;
        bonusAdminState.jobs = [];
        renderBonusAdminSummaryAndBreakdown();
        renderBonusAdminJobsList();
      }
    });
  }

  const editJobForm = document.getElementById('bonusAdminEditJobForm');
  const editJobSaveBtn = document.getElementById('bonusAdminEditJobSaveBtn');
  const editJobCancelBtn = document.getElementById('bonusAdminEditJobCancelBtn');
  if (editJobForm && !editJobForm.dataset.bonusAdminBound) {
    editJobForm.dataset.bonusAdminBound = 'true';
    editJobForm.addEventListener('submit', (e) => {
      e.preventDefault();
      void saveBonusAdminEditJob();
    });
  }
  if (editJobSaveBtn && !editJobSaveBtn.dataset.bonusAdminBound) {
    editJobSaveBtn.dataset.bonusAdminBound = 'true';
    editJobSaveBtn.addEventListener('click', () => void saveBonusAdminEditJob());
  }
  if (editJobCancelBtn && !editJobCancelBtn.dataset.bonusAdminBound) {
    editJobCancelBtn.dataset.bonusAdminBound = 'true';
    editJobCancelBtn.addEventListener('click', () => {
      closeAccessibleModal('bonusAdminEditJobModal');
      bonusAdminEditJobId = null;
    });
  }

  const editPersonnelSaveBtn = document.getElementById('bonusAdminEditPersonnelSaveBtn');
  const editPersonnelCancelBtn = document.getElementById('bonusAdminEditPersonnelCancelBtn');
  if (editPersonnelSaveBtn && !editPersonnelSaveBtn.dataset.bonusAdminBound) {
    editPersonnelSaveBtn.dataset.bonusAdminBound = 'true';
    editPersonnelSaveBtn.addEventListener('click', () => void saveBonusAdminEditPersonnel());
  }
  if (editPersonnelCancelBtn && !editPersonnelCancelBtn.dataset.bonusAdminBound) {
    editPersonnelCancelBtn.dataset.bonusAdminBound = 'true';
    editPersonnelCancelBtn.addEventListener('click', () => {
      closeAccessibleModal('bonusAdminEditPersonnelModal');
      bonusAdminEditPersonnelJobId = null;
      bonusAdminEditPersonnelData = [];
    });
  }

  const createPeriodBtn = document.getElementById('btnBonusAdminCreatePeriod');
  const editPeriodBtn = document.getElementById('btnBonusAdminEditPeriod');
  if (createPeriodBtn && !createPeriodBtn.dataset.bonusAdminBound) {
    createPeriodBtn.dataset.bonusAdminBound = 'true';
    createPeriodBtn.addEventListener('click', () => openBonusAdminCreatePeriodModal());
  }
  if (editPeriodBtn && !editPeriodBtn.dataset.bonusAdminBound) {
    editPeriodBtn.dataset.bonusAdminBound = 'true';
    editPeriodBtn.addEventListener('click', () => {
      const periodId = bonusAdminState.selectedPeriodId;
      if (periodId) openBonusAdminEditPeriodModal(periodId);
    });
  }

  const periodForm = document.getElementById('bonusAdminPeriodForm');
  const periodSaveBtn = document.getElementById('bonusAdminPeriodSaveBtn');
  const periodCancelBtn = document.getElementById('bonusAdminPeriodCancelBtn');
  if (periodForm && !periodForm.dataset.bonusAdminBound) {
    periodForm.dataset.bonusAdminBound = 'true';
    periodForm.addEventListener('submit', (e) => {
      e.preventDefault();
      void saveBonusAdminPeriod();
    });
  }
  if (periodSaveBtn && !periodSaveBtn.dataset.bonusAdminBound) {
    periodSaveBtn.dataset.bonusAdminBound = 'true';
    periodSaveBtn.addEventListener('click', () => void saveBonusAdminPeriod());
  }
  if (periodCancelBtn && !periodCancelBtn.dataset.bonusAdminBound) {
    periodCancelBtn.dataset.bonusAdminBound = 'true';
    periodCancelBtn.addEventListener('click', () => {
      closeAccessibleModal('bonusAdminPeriodModal');
      bonusAdminEditPeriodId = null;
    });
  }
}

let bonusAdminEditPersonnelJobId = null;
let bonusAdminEditPersonnelData = [];

function populateBonusAdminEditPersonnelTable(personnel, jobIdentifier) {
  const tbody = document.getElementById('bonusAdminEditPersonnelTableBody');
  const subtitleEl = document.getElementById('bonusAdminEditPersonnelModalSubtitle');
  if (!tbody) return;
  if (subtitleEl) subtitleEl.textContent = jobIdentifier ? `Job ${jobIdentifier}` : '';

  const list = Array.isArray(personnel) ? personnel : [];
  tbody.innerHTML = list.map((p, index) => {
    const pid = String(p.id || '').trim();
    const label = `Personnel ${index + 1}`;
    const onsite = Math.max(0, parseInt(p.onsite_minutes, 10) || 0);
    const travel = Math.max(0, parseInt(p.travel_shopping_minutes, 10) || 0);
    const seller = !!p.is_seller;
    const executor = !!p.is_executor;
    const spotter = !!p.is_spotter;
    return `<tr data-personnel-id="${escapeHtml(pid)}">
      <td>${escapeHtml(label)}</td>
      <td><input type="number" min="0" step="1" value="${onsite}" aria-label="Onsite minutes for ${escapeHtml(label)}" class="bonus-admin-personnel-onsite" data-personnel-id="${escapeHtml(pid)}" /></td>
      <td><input type="number" min="0" step="1" value="${travel}" aria-label="Travel minutes for ${escapeHtml(label)}" class="bonus-admin-personnel-travel" data-personnel-id="${escapeHtml(pid)}" /></td>
      <td><input type="checkbox" ${seller ? 'checked' : ''} aria-label="Seller for ${escapeHtml(label)}" class="bonus-admin-personnel-seller" data-personnel-id="${escapeHtml(pid)}" /></td>
      <td><input type="checkbox" ${executor ? 'checked' : ''} aria-label="Executor for ${escapeHtml(label)}" class="bonus-admin-personnel-executor" data-personnel-id="${escapeHtml(pid)}" /></td>
      <td><input type="checkbox" ${spotter ? 'checked' : ''} aria-label="Spotter for ${escapeHtml(label)}" class="bonus-admin-personnel-spotter" data-personnel-id="${escapeHtml(pid)}" /></td>
    </tr>`;
  }).join('');
}

async function openBonusAdminEditPersonnelModal(jobId, jobIdentifier) {
  if (!jobId || !canAccessDesktopAdminUi()) return;
  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const errorEl = document.getElementById('bonusAdminEditPersonnelError');
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }

  try {
    const resp = await fetch(`/api/bonus/job-performance/${encodeURIComponent(jobId)}/personnel`, { headers: { ...getAuthHeaders() } });
    if (handleAuthFailure(resp)) return;
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      showMessage(typeof data?.detail === 'string' ? data.detail : 'Failed to load personnel.', 'error');
      return;
    }
    const personnel = Array.isArray(data.personnel) ? data.personnel : [];
    bonusAdminEditPersonnelJobId = jobId;
    bonusAdminEditPersonnelData = personnel.map((p) => ({
      id: p.id,
      onsite_minutes: Math.max(0, parseInt(p.onsite_minutes, 10) || 0),
      travel_shopping_minutes: Math.max(0, parseInt(p.travel_shopping_minutes, 10) || 0),
      is_seller: !!p.is_seller,
      is_executor: !!p.is_executor,
      is_spotter: !!p.is_spotter,
    }));
    populateBonusAdminEditPersonnelTable(personnel, jobIdentifier || null);
    openAccessibleModal('bonusAdminEditPersonnelModal', { triggerEl });
  } catch (err) {
    showMessage(err?.message || 'Failed to load personnel.', 'error');
  }
}

async function saveBonusAdminEditPersonnel() {
  const jobId = bonusAdminEditPersonnelJobId;
  if (!jobId || !canAccessDesktopAdminUi()) return;
  const errorEl = document.getElementById('bonusAdminEditPersonnelError');
  const saveBtn = document.getElementById('bonusAdminEditPersonnelSaveBtn');
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  if (saveBtn) saveBtn.disabled = true;

  try {
    const tbody = document.getElementById('bonusAdminEditPersonnelTableBody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr[data-personnel-id]');
    const updates = [];
    for (const row of rows) {
      const pid = row.getAttribute('data-personnel-id');
      if (!pid) continue;
      const onsiteInput = row.querySelector('.bonus-admin-personnel-onsite');
      const travelInput = row.querySelector('.bonus-admin-personnel-travel');
      const sellerInput = row.querySelector('.bonus-admin-personnel-seller');
      const executorInput = row.querySelector('.bonus-admin-personnel-executor');
      const spotterInput = row.querySelector('.bonus-admin-personnel-spotter');
      const onsite = Math.max(0, parseInt(onsiteInput?.value, 10) || 0);
      const travel = Math.max(0, parseInt(travelInput?.value, 10) || 0);
      const seller = !!(sellerInput && sellerInput.checked);
      const executor = !!(executorInput && executorInput.checked);
      const spotter = !!(spotterInput && spotterInput.checked);
      const original = bonusAdminEditPersonnelData.find((p) => String(p.id) === String(pid));
      if (!original) continue;
      const changed =
        original.onsite_minutes !== onsite ||
        original.travel_shopping_minutes !== travel ||
        original.is_seller !== seller ||
        original.is_executor !== executor ||
        original.is_spotter !== spotter;
      if (changed) updates.push({ personnel_id: pid, body: { onsite_minutes: onsite, travel_shopping_minutes: travel, is_seller: seller, is_executor: executor, is_spotter: spotter } });
    }
    for (const { personnel_id, body } of updates) {
      const resp = await fetch(`/api/bonus/job-personnel/${encodeURIComponent(personnel_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (handleAuthFailure(resp)) return;
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data?.detail === 'string' ? data.detail : 'Failed to update personnel.';
        if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
        return;
      }
    }
    closeAccessibleModal('bonusAdminEditPersonnelModal', { restoreFocus: true });
    bonusAdminEditPersonnelJobId = null;
    bonusAdminEditPersonnelData = [];
    showMessage(updates.length > 0 ? 'Personnel updated.' : 'No changes to save.', 'success');
    void fetchBonusAdminSummaryAndBreakdown();
  } catch (err) {
    if (errorEl) { errorEl.textContent = err?.message || 'Failed to save personnel.'; errorEl.hidden = false; }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

let bonusAdminEditPeriodId = null;

function openBonusAdminCreatePeriodModal() {
  if (!canAccessDesktopAdminUi()) return;
  const titleEl = document.getElementById('bonusAdminPeriodModalTitle');
  const nameEl = document.getElementById('bonusAdminPeriodName');
  const startEl = document.getElementById('bonusAdminPeriodStartDate');
  const endEl = document.getElementById('bonusAdminPeriodEndDate');
  const statusEl = document.getElementById('bonusAdminPeriodStatus');
  const errorEl = document.getElementById('bonusAdminPeriodError');
  if (titleEl) titleEl.textContent = 'Create period';
  if (nameEl) nameEl.value = '';
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';
  if (statusEl) statusEl.value = 'open';
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  bonusAdminEditPeriodId = null;
  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  openAccessibleModal('bonusAdminPeriodModal', { triggerEl });
}

function openBonusAdminEditPeriodModal(periodId) {
  if (!periodId || !canAccessDesktopAdminUi()) return;
  const period = (bonusAdminState.periods || []).find((p) => String(p.id) === String(periodId));
  if (!period) {
    showMessage('Period not found.', 'error');
    return;
  }
  const titleEl = document.getElementById('bonusAdminPeriodModalTitle');
  const nameEl = document.getElementById('bonusAdminPeriodName');
  const startEl = document.getElementById('bonusAdminPeriodStartDate');
  const endEl = document.getElementById('bonusAdminPeriodEndDate');
  const statusEl = document.getElementById('bonusAdminPeriodStatus');
  const errorEl = document.getElementById('bonusAdminPeriodError');
  if (titleEl) titleEl.textContent = 'Edit period';
  if (nameEl) nameEl.value = String(period.period_name || '').trim();
  if (startEl) startEl.value = period.start_date ? String(period.start_date).slice(0, 10) : '';
  if (endEl) endEl.value = period.end_date ? String(period.end_date).slice(0, 10) : '';
  if (statusEl) statusEl.value = period.status === 'processing' || period.status === 'closed' ? period.status : 'open';
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  bonusAdminEditPeriodId = periodId;
  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  openAccessibleModal('bonusAdminPeriodModal', { triggerEl });
}

async function saveBonusAdminPeriod() {
  if (!canAccessDesktopAdminUi()) return;
  const nameEl = document.getElementById('bonusAdminPeriodName');
  const startEl = document.getElementById('bonusAdminPeriodStartDate');
  const endEl = document.getElementById('bonusAdminPeriodEndDate');
  const statusEl = document.getElementById('bonusAdminPeriodStatus');
  const errorEl = document.getElementById('bonusAdminPeriodError');
  const saveBtn = document.getElementById('bonusAdminPeriodSaveBtn');
  if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
  if (saveBtn) saveBtn.disabled = true;

  const period_name = (nameEl?.value || '').trim();
  const start_date = startEl?.value || '';
  const end_date = endEl?.value || '';
  const status = (statusEl?.value || 'open').trim();

  if (!period_name) {
    if (errorEl) { errorEl.textContent = 'Period name is required.'; errorEl.hidden = false; }
    if (saveBtn) saveBtn.disabled = false;
    return;
  }
  if (!start_date || !end_date) {
    if (errorEl) { errorEl.textContent = 'Start date and end date are required.'; errorEl.hidden = false; }
    if (saveBtn) saveBtn.disabled = false;
    return;
  }
  if (start_date > end_date) {
    if (errorEl) { errorEl.textContent = 'Start date must be before or equal to end date.'; errorEl.hidden = false; }
    if (saveBtn) saveBtn.disabled = false;
    return;
  }
  if (!['open', 'processing', 'closed'].includes(status)) {
    if (errorEl) { errorEl.textContent = 'Status must be open, processing, or closed.'; errorEl.hidden = false; }
    if (saveBtn) saveBtn.disabled = false;
    return;
  }

  try {
    const isEdit = !!bonusAdminEditPeriodId;
    let createdOrUpdatedId = bonusAdminEditPeriodId;

    if (isEdit) {
      const resp = await fetch(`/api/bonus/periods/${encodeURIComponent(bonusAdminEditPeriodId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ period_name, start_date, end_date, status }),
      });
      if (handleAuthFailure(resp)) return;
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data?.detail === 'string' ? data.detail : 'Failed to update period.';
        if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
        return;
      }
    } else {
      const resp = await fetch('/api/bonus/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ period_name, start_date, end_date, status }),
      });
      if (handleAuthFailure(resp)) return;
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data?.detail === 'string' ? data.detail : 'Failed to create period.';
        if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
        return;
      }
      createdOrUpdatedId = data?.id || null;
    }

    closeAccessibleModal('bonusAdminPeriodModal', { restoreFocus: true });
    bonusAdminEditPeriodId = null;
    showMessage(isEdit ? 'Period updated.' : 'Period created.', 'success');

    await fetchBonusAdminPeriods();
    if (createdOrUpdatedId && !isEdit) {
      bonusAdminState.selectedPeriodId = String(createdOrUpdatedId);
      renderBonusAdminPeriodSelect();
      void fetchBonusAdminSummaryAndBreakdown();
    } else if (isEdit) {
      renderBonusAdminPeriodSelect();
    }
  } catch (err) {
    if (errorEl) { errorEl.textContent = err?.message || 'Failed to save period.'; errorEl.hidden = false; }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function updateMobileBonusButtonVisibility() {
  const btn = document.getElementById('mobileBonusDashboardBtn');
  if (!btn) return;
  const isMobile = layoutState.viewportMode === 'mobile';
  btn.hidden = !(isMobile && canAccessTechnicianBonusView());
}

function openTechnicianBonusView(triggerEl) {
  if (!canAccessTechnicianBonusView()) {
    showMessage('Your role does not allow access to the bonus dashboard.', 'error');
    return;
  }
  switchView('view-technician-bonus', { triggerEl });
}

function syncAdminDesktopAccess(options = {}) {
  updateUserPermissionsMenuVisibility();
  updateMaterialRulesMenuVisibility();
  updateTechnicianBonusMenuVisibility();
  updateBonusAdminMenuVisibility();
  updateMobileBonusButtonVisibility();

  const quoteTable = document.getElementById('quotePartsTable');
  if (!canUsePricingAdminControls() && quoteTable?.classList.contains('quote-parts-table--editing')) {
    setQuoteEditMode(false);
  }
  document.querySelectorAll('#quoteTableBody .quote-input-markup-inline').forEach((input) => {
    if (input instanceof HTMLInputElement) input.disabled = !canUsePricingAdminControls();
  });
  updateSavePricingButtonState();

  if (getVisibleViewId() === 'view-user-permissions' && !canAccessDesktopAdminUi()) {
    if (!authState.token) {
      closeAllModals({ restoreFocus: false });
      switchView('view-login');
      if (options.notify !== false) showMessage('Session expired. Please sign in again.', 'info');
    } else {
      switchView('view-canvas', { focus: options.focus !== false });
      if (options.notify !== false) {
        const message = isDesktopViewport()
          ? 'Only admin users can access User Permissions.'
          : 'User Permissions is available on desktop only.';
        showMessage(message, 'info');
      }
    }
  }

  if (getVisibleViewId() === 'view-material-rules' && !canAccessDesktopAdminUi()) {
    if (!authState.token) {
      closeAllModals({ restoreFocus: false });
      switchView('view-login');
      if (options.notify !== false) showMessage('Session expired. Please sign in again.', 'info');
    } else {
      switchView('view-canvas', { focus: options.focus !== false });
      if (options.notify !== false) {
        const message = isDesktopViewport()
          ? 'Only admin users can access Material Rules.'
          : 'Material Rules is available on desktop only.';
        showMessage(message, 'info');
      }
    }
  }

  if (getVisibleViewId() === 'view-bonus-admin' && !canAccessDesktopAdminUi()) {
    if (!authState.token) {
      closeAllModals({ restoreFocus: false });
      bonusAdminEditJobId = null;
      bonusAdminEditPersonnelJobId = null;
      bonusAdminEditPersonnelData = [];
      bonusAdminEditPeriodId = null;
      switchView('view-login');
      if (options.notify !== false) showMessage('Session expired. Please sign in again.', 'info');
    } else {
      closeAccessibleModal('bonusAdminEditJobModal');
      closeAccessibleModal('bonusAdminEditPersonnelModal');
      closeAccessibleModal('bonusAdminPeriodModal');
      bonusAdminEditJobId = null;
      bonusAdminEditPersonnelJobId = null;
      bonusAdminEditPersonnelData = [];
      bonusAdminEditPeriodId = null;
      switchView('view-canvas', { focus: options.focus !== false });
      if (options.notify !== false) {
        const message = isDesktopViewport()
          ? 'Only admin users can access Bonus Admin.'
          : 'Bonus Admin is available on desktop only.';
        showMessage(message, 'info');
      }
    }
  }

  if (getVisibleViewId() === 'view-technician-bonus' && !canAccessTechnicianBonusView()) {
    if (!authState.token) {
      closeAllModals({ restoreFocus: false });
      switchView('view-login');
      if (options.notify !== false) showMessage('Session expired. Please sign in again.', 'info');
    } else {
      switchView('view-canvas', { focus: options.focus !== false });
      if (options.notify !== false) {
        showMessage('Your role does not allow access to the bonus dashboard.', 'info');
      }
    }
  }
}

function filterUserPermissions() {
  const query = userPermissionsState.searchTerm.trim().toLowerCase();
  const list = Array.isArray(userPermissionsState.users) ? userPermissionsState.users : [];
  if (!query) {
    userPermissionsState.filteredUsers = list.slice();
  } else {
    userPermissionsState.filteredUsers = list.filter((user) => {
      const email = String(user?.email || '').toLowerCase();
      const userId = String(user?.user_id || '').toLowerCase();
      return email.includes(query) || userId.includes(query);
    });
  }
  renderUserPermissionsList();
}

/** Format last_sign_in_at for User Permissions table: "8:30pm Today" or "8:30pm February 25th". */
function formatLastLoginDisplay(isoString) {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return 'Never';
  const timeStr = d
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace(/\s/g, '');
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return `${timeStr} Today`;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const day = d.getDate();
  const suffix =
    day >= 11 && day <= 13 ? 'th' : (['st', 'nd', 'rd'][(day % 10) - 1] || 'th');
  return `${timeStr} ${months[d.getMonth()]} ${day}${suffix}`;
}

function renderUserPermissionsList() {
  const tableBody = document.getElementById('userPermissionsTableBody');
  const emptyState = document.getElementById('userPermissionsEmpty');
  if (!tableBody || !emptyState) return;

  tableBody.innerHTML = '';
  const rows = Array.isArray(userPermissionsState.filteredUsers) ? userPermissionsState.filteredUsers : [];
  emptyState.hidden = rows.length !== 0;

  rows.forEach((user) => {
    const userId = String(user?.user_id || '').trim();
    const currentRole = normalizeAppRole(user?.role);
    const draftRole = normalizeAppRole(userPermissionsState.draftRoles.get(userId) || currentRole);
    const isDirty = draftRole !== currentRole;
    const isSaving = userPermissionsState.savingUserIds.has(userId);
    const rowMessage = userPermissionsState.rowMessages.get(userId);
    const isSuperAdmin = !!user?.is_super_admin;

    const tr = document.createElement('tr');

    const emailTd = document.createElement('td');
    emailTd.textContent = user?.email || 'No email';
    tr.appendChild(emailTd);

    const roleTd = document.createElement('td');
    if (isSuperAdmin) {
      const superAdminSpan = document.createElement('span');
      superAdminSpan.className = 'permissions-role-super-admin';
      superAdminSpan.textContent = 'Super admin';
      superAdminSpan.setAttribute('aria-label', 'Super admin (cannot be changed)');
      roleTd.appendChild(superAdminSpan);
    } else {
      const roleSelect = document.createElement('select');
      roleSelect.className = 'permissions-role-select';
      roleSelect.setAttribute('aria-label', `Role for ${user?.email || userId}`);
      ['viewer', 'editor', 'technician', 'admin'].forEach((roleValue) => {
        const option = document.createElement('option');
        option.value = roleValue;
        option.textContent = roleValue;
        roleSelect.appendChild(option);
      });
      roleSelect.value = draftRole;
      roleSelect.disabled = isSaving;
      roleSelect.addEventListener('change', () => {
        const selectedRole = normalizeAppRole(roleSelect.value);
        if (selectedRole === currentRole) {
          userPermissionsState.draftRoles.delete(userId);
        } else {
          userPermissionsState.draftRoles.set(userId, selectedRole);
        }
        if (rowMessage?.type === 'success') userPermissionsState.rowMessages.delete(userId);
        filterUserPermissions();
      });
      roleTd.appendChild(roleSelect);
    }
    tr.appendChild(roleTd);

    const lastLoginTd = document.createElement('td');
    lastLoginTd.className = 'permissions-last-login-cell';
    lastLoginTd.textContent = formatLastLoginDisplay(user?.last_sign_in_at);
    tr.appendChild(lastLoginTd);

    const actionTd = document.createElement('td');
    actionTd.className = 'permissions-action-cell';
    if (!isSuperAdmin) {
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'permissions-save-btn';
      saveBtn.textContent = isSaving ? 'Saving...' : 'Save';
      saveBtn.disabled = isSaving || !isDirty;
      saveBtn.addEventListener('click', () => {
        const nextRole = normalizeAppRole(userPermissionsState.draftRoles.get(userId));
        if (!nextRole || nextRole === currentRole) return;
        void saveUserPermissionRole(userId, nextRole);
      });
      actionTd.appendChild(saveBtn);
    }
    const statusSpan = document.createElement('span');
    statusSpan.className = 'permissions-row-status';
    if (rowMessage?.type === 'error') statusSpan.classList.add('permissions-row-status--error');
    if (rowMessage?.type === 'success') statusSpan.classList.add('permissions-row-status--success');
    statusSpan.textContent = rowMessage?.text || '';
    actionTd.appendChild(statusSpan);

    const isCurrentUser = authState.user?.id === userId;
    if (!isCurrentUser && !isSuperAdmin) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'permissions-remove-btn btn-text-icon';
      removeBtn.setAttribute('aria-label', 'Remove user');
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', async () => {
        const email = user?.email || userId;
        const confirmed = await showAppConfirm(`Remove ${email}? They will lose access.`, {
          title: 'Remove user',
          confirmText: 'Remove',
          destructive: true,
          triggerEl: removeBtn,
        });
        if (confirmed) void removeUserPermission(userId);
      });
      actionTd.appendChild(removeBtn);
    }

    tr.appendChild(actionTd);
    tableBody.appendChild(tr);
  });
}

async function fetchUserPermissions(options = {}) {
  if (!canAccessDesktopAdminUi()) {
    userPermissionsState.users = [];
    userPermissionsState.filteredUsers = [];
    userPermissionsState.draftRoles.clear();
    userPermissionsState.rowMessages.clear();
    renderUserPermissionsList();
    setUserPermissionsStatus(
      isDesktopViewport()
        ? 'Only admin users can load permissions.'
        : 'User Permissions is available on desktop only.',
      'error'
    );
    return;
  }

  userPermissionsState.loading = true;
  setUserPermissionsStatus('Loading users…');

  try {
    const resp = await fetch('/api/admin/user-permissions', {
      headers: { ...getAuthHeaders() },
    });
    if (handleAuthFailure(resp)) return;
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = typeof payload?.detail === 'string'
        ? payload.detail
        : (payload?.detail?.msg || 'Failed to load user permissions.');
      throw Object.assign(new Error(detail), { status: resp.status });
    }

    const users = Array.isArray(payload?.users) ? payload.users : [];
    userPermissionsState.users = users
      .map((user) => ({
        user_id: String(user?.user_id || '').trim(),
        email: String(user?.email || '').trim(),
        role: normalizeAppRole(user?.role),
        is_super_admin: !!user?.is_super_admin,
        created_at: user?.created_at || null,
        last_sign_in_at: user?.last_sign_in_at || null,
      }))
      .filter((user) => user.user_id);
    userPermissionsState.draftRoles.clear();
    userPermissionsState.rowMessages.clear();
    filterUserPermissions();

    if (options.showSuccessToast) {
      setUserPermissionsStatus(`Loaded ${userPermissionsState.users.length} users.`, 'success');
    } else {
      setUserPermissionsStatus('');
    }
  } catch (err) {
    console.error('Failed to fetch user permissions', err);
    const message = err?.message || 'Failed to load user permissions.';
    userPermissionsState.users = [];
    userPermissionsState.filteredUsers = [];
    userPermissionsState.draftRoles.clear();
    renderUserPermissionsList();
    setUserPermissionsStatus(message, 'error');
  } finally {
    userPermissionsState.loading = false;
  }
}

async function saveUserPermissionRole(userId, role) {
  if (!canAccessDesktopAdminUi()) {
    setUserPermissionsStatus('Only admin users can update roles.', 'error');
    return;
  }
  const normalizedRole = normalizeAppRole(role);
  if (!userId || !normalizedRole) return;

  userPermissionsState.savingUserIds.add(userId);
  userPermissionsState.rowMessages.set(userId, { type: 'info', text: 'Saving…' });
  renderUserPermissionsList();

  try {
    const resp = await fetch(`/api/admin/user-permissions/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ role: normalizedRole }),
    });
    if (handleAuthFailure(resp)) return;
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = typeof payload?.detail === 'string'
        ? payload.detail
        : (payload?.detail?.msg || 'Failed to update role.');
      throw new Error(detail);
    }

    const updated = payload?.user || {};
    const index = userPermissionsState.users.findIndex((user) => user.user_id === userId);
    if (index >= 0) {
      userPermissionsState.users[index] = {
        ...userPermissionsState.users[index],
        ...updated,
        role: normalizeAppRole(updated?.role || normalizedRole),
      };
    }
    userPermissionsState.draftRoles.delete(userId);
    userPermissionsState.rowMessages.set(userId, {
      type: 'success',
      text: `Updated to ${normalizeAppRole(updated?.role || normalizedRole)}.`,
    });
    filterUserPermissions();
    if (authState.user?.id === userId) {
      setUserPermissionsStatus('Your role changed. Sign out and sign in again to refresh JWT claims.', 'success');
    }
  } catch (err) {
    console.error('Failed to update user role', err);
    userPermissionsState.rowMessages.set(userId, {
      type: 'error',
      text: err?.message || 'Failed to update role.',
    });
    renderUserPermissionsList();
  } finally {
    userPermissionsState.savingUserIds.delete(userId);
    renderUserPermissionsList();
  }
}

async function removeUserPermission(userId) {
  if (!canAccessDesktopAdminUi()) {
    setUserPermissionsStatus('Only admin users can remove users.', 'error');
    return;
  }
  if (!userId) return;
  try {
    const resp = await fetch(`/api/admin/user-permissions/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (handleAuthFailure(resp)) return;
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = typeof payload?.detail === 'string' ? payload.detail : (payload?.detail?.msg || 'Failed to remove user.');
      throw new Error(detail);
    }
    userPermissionsState.users = userPermissionsState.users.filter((u) => u.user_id !== userId);
    userPermissionsState.filteredUsers = userPermissionsState.filteredUsers.filter((u) => u.user_id !== userId);
    userPermissionsState.draftRoles.delete(userId);
    userPermissionsState.rowMessages.delete(userId);
    filterUserPermissions();
    renderUserPermissionsList();
    setUserPermissionsStatus('User removed.', 'success');
  } catch (err) {
    console.error('Remove user failed', err);
    setUserPermissionsStatus(err?.message || 'Failed to remove user.', 'error');
  }
}

function initUserPermissionsView() {
  if (userPermissionsState.initialized) return;
  userPermissionsState.initialized = true;

  const backBtn = document.getElementById('btnPermissionsBackToCanvas');
  const refreshBtn = document.getElementById('btnRefreshUserPermissions');
  const searchInput = document.getElementById('userPermissionsSearch');
  const inviteBtn = document.getElementById('btnInviteUser');
  const inviteEmail = document.getElementById('inviteUserEmail');
  const inviteRole = document.getElementById('inviteUserRole');
  const inviteError = document.getElementById('inviteUserError');
  const inviteSubmitBtn = document.getElementById('inviteUserSubmitBtn');
  const inviteCancelBtn = document.getElementById('inviteUserCancelBtn');

  if (inviteBtn) inviteBtn.hidden = !canAccessDesktopAdminUi();

  backBtn?.addEventListener('click', () => {
    switchView('view-canvas', { triggerEl: backBtn });
  });

  refreshBtn?.addEventListener('click', () => {
    void fetchUserPermissions({ showSuccessToast: true });
  });

  searchInput?.addEventListener('input', () => {
    userPermissionsState.searchTerm = searchInput.value || '';
    filterUserPermissions();
  });

  inviteBtn?.addEventListener('click', () => {
    if (!canAccessDesktopAdminUi()) return;
    if (inviteError) { inviteError.hidden = true; inviteError.textContent = ''; }
    if (inviteEmail) { inviteEmail.value = ''; inviteEmail.setCustomValidity(''); }
    if (inviteRole) inviteRole.value = 'viewer';
    openAccessibleModal('inviteUserModal', { triggerEl: inviteBtn, initialFocusEl: inviteEmail });
  });

  inviteCancelBtn?.addEventListener('click', () => {
    closeAccessibleModal('inviteUserModal');
  });

  inviteSubmitBtn?.addEventListener('click', async () => {
    const email = (inviteEmail?.value || '').trim();
    if (!email) {
      if (inviteError) { inviteError.hidden = false; inviteError.textContent = 'Enter an email address.'; }
      return;
    }
    if (!email.includes('@')) {
      if (inviteError) { inviteError.hidden = false; inviteError.textContent = 'Enter a valid email address.'; }
      return;
    }
    if (inviteError) { inviteError.hidden = true; inviteError.textContent = ''; }
    const role = normalizeAppRole(inviteRole?.value || 'viewer');
    inviteSubmitBtn.disabled = true;
    try {
      const resp = await fetch('/api/admin/user-permissions/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email, role }),
      });
      if (handleAuthFailure(resp)) return;
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : (payload?.detail?.msg || 'Failed to send invite.');
        throw new Error(detail);
      }
      setUserPermissionsStatus(`Invite sent to ${email}. They'll get an email to set their password.`, 'success');
      closeAccessibleModal('inviteUserModal');
      void fetchUserPermissions();
    } catch (err) {
      console.error('Invite user failed', err);
      if (inviteError) { inviteError.hidden = false; inviteError.textContent = err?.message || 'Failed to send invite.'; }
    } finally {
      inviteSubmitBtn.disabled = false;
    }
  });
}

function setMaterialRulesStatus(message, tone = 'info') {
  const el = document.getElementById('materialRulesStatus');
  if (!el) return;
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('permissions-status--error', 'permissions-status--success');
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('permissions-status--error', tone === 'error');
  el.classList.toggle('permissions-status--success', tone === 'success');
}

function getMaterialRulesApiError(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  const validationErrors = Array.isArray(detail?.validation_errors) ? detail.validation_errors : [];
  if (validationErrors.length > 0) {
    const codeFallbacks = {
      repair_type_id_set_locked: 'Repair type IDs are locked and cannot be added, removed, or renamed in this UI.',
      reserved_repair_type_missing: "Reserved repair type 'other' must remain present.",
      disallowed_product_id: 'Selected product ID is not allowed for Material Rules.',
      missing_product_pricing: 'Selected product is missing pricing fields required by quote calculation.',
    };
    return validationErrors
      .slice(0, 3)
      .map((err) => {
        const message = String(err?.message || '').trim();
        if (message) return message;
        const code = String(err?.code || '').trim();
        return codeFallbacks[code] || '';
      })
      .filter(Boolean)
      .join(' ');
  }
  return fallback;
}

function updateMaterialRulesActionButtons() {
  const reloadBtn = document.getElementById('btnMaterialRulesReload');
  const saveQuickQuoterBtn = document.getElementById('btnMaterialRulesSaveQuickQuoter');
  const saveMeasuredBtn = document.getElementById('btnMaterialRulesSaveMeasured');
  const disableAll = materialRulesState.loading || materialRulesState.savingQuickQuoter || materialRulesState.savingMeasured;
  if (reloadBtn) reloadBtn.disabled = disableAll;
  if (saveQuickQuoterBtn) {
    saveQuickQuoterBtn.disabled = disableAll;
    saveQuickQuoterBtn.textContent = materialRulesState.savingQuickQuoter ? 'Saving…' : 'Save Quick Quoter Rules';
  }
  if (saveMeasuredBtn) {
    saveMeasuredBtn.disabled = disableAll;
    saveMeasuredBtn.textContent = materialRulesState.savingMeasured ? 'Saving…' : 'Save Measured Rules';
  }
  document.querySelectorAll('.material-rules-add-template-btn').forEach((button) => {
    if (button instanceof HTMLButtonElement) button.disabled = disableAll;
  });
}

function isMaterialRulesDisallowedProductId(productId) {
  const id = String(productId || '').trim();
  if (!id) return false;
  return MATERIAL_RULES_DISALLOWED_PRODUCT_IDS_UPPER.has(id.toUpperCase());
}

function getMaterialRulesAllowedProductIds() {
  const ids = Array.from(materialRulesState.productMetaById.keys()).filter((id) => !isMaterialRulesDisallowedProductId(id));
  return ids.sort((a, b) => a.localeCompare(b));
}

function getMaterialRulesProductLabel(productId) {
  const id = String(productId || '').trim();
  if (!id) return '';
  const meta = materialRulesState.productMetaById.get(id);
  const name = String(meta?.name || '').trim();
  return name ? `${id} — ${name}` : id;
}

/** Display name only (no product ID prefix); for template dropdowns. */
function getMaterialRulesProductNameOnly(productId) {
  const id = String(productId || '').trim();
  if (!id) return '';
  const meta = materialRulesState.productMetaById.get(id);
  const name = String(meta?.name || '').trim();
  return name || id;
}

function getMaterialRulesRepairTypeSelectOptionsHtml(selectedId) {
  const selected = String(selectedId || '').trim();
  const ids = Array.from(new Set((materialRulesState.repairTypes || []).map((row) => String(row?.id || '').trim()).filter(Boolean))).sort();
  const parts = ['<option value="">Select…</option>'];
  ids.forEach((id) => {
    parts.push(`<option value="${escapeHtml(id)}" ${id === selected ? 'selected' : ''}>${escapeHtml(id)}</option>`);
  });
  if (selected && !ids.includes(selected)) {
    parts.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(`⚠ Invalid: ${selected}`)}</option>`);
  }
  return parts.join('');
}

function getMaterialRulesProductSelectOptionsHtml(selectedId, nameOnly = false) {
  const selected = String(selectedId || '').trim();
  const allowedIds = getMaterialRulesAllowedProductIds();
  const labelFn = nameOnly ? getMaterialRulesProductNameOnly : getMaterialRulesProductLabel;
  const parts = ['<option value="">Select…</option>'];
  allowedIds.forEach((id) => {
    parts.push(
      `<option value="${escapeHtml(id)}" ${id === selected ? 'selected' : ''}>${escapeHtml(labelFn(id))}</option>`
    );
  });
  if (selected && !allowedIds.includes(selected)) {
    parts.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(`⚠ Invalid: ${selected}`)}</option>`);
  }
  return parts.join('');
}

function getMaterialRulesTemplateGroupsContainer() {
  const el = document.getElementById('materialRulesTemplateGroups');
  return el instanceof HTMLElement ? el : null;
}

function getMaterialRulesTemplateSections() {
  const repairTypes = Array.isArray(materialRulesState.repairTypes) ? materialRulesState.repairTypes : [];
  const templates = Array.isArray(materialRulesState.templates) ? materialRulesState.templates : [];
  const templatesByRepairTypeId = new Map();

  templates.forEach((template) => {
    const repairTypeId = String(template?.repair_type_id || '').trim();
    if (!templatesByRepairTypeId.has(repairTypeId)) templatesByRepairTypeId.set(repairTypeId, []);
    templatesByRepairTypeId.get(repairTypeId).push(template);
  });

  const sections = [];
  repairTypes.forEach((repairType) => {
    const repairTypeId = String(repairType?.id || '').trim();
    if (!repairTypeId) return;
    const label = String(repairType?.label || '').trim() || repairTypeId;
    sections.push({
      repairTypeId,
      label,
      isUnknown: false,
      rows: templatesByRepairTypeId.get(repairTypeId) || [],
    });
    templatesByRepairTypeId.delete(repairTypeId);
  });

  Array.from(templatesByRepairTypeId.entries())
    .sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')))
    .forEach(([repairTypeId, rows]) => {
      sections.push({
        repairTypeId,
        label: String(repairTypeId || 'missing'),
        isUnknown: true,
        rows,
      });
    });

  return sections;
}

function renderMaterialRulesMeasuredProductSelects(rules = null) {
  const safe = rules || materialRulesState.measuredRules || {};
  const fieldMap = [
    ['materialRulesScrewProductId', safe.screw_product_id],
    ['materialRulesBracketProductIdSc', safe.bracket_product_id_sc],
    ['materialRulesBracketProductIdCl', safe.bracket_product_id_cl],
    ['materialRulesSaddleClipProductId65', safe.saddle_clip_product_id_65],
    ['materialRulesSaddleClipProductId80', safe.saddle_clip_product_id_80],
    ['materialRulesAdjustableClipProductId65', safe.adjustable_clip_product_id_65],
    ['materialRulesAdjustableClipProductId80', safe.adjustable_clip_product_id_80],
  ];
  fieldMap.forEach(([elementId, selected]) => {
    const el = document.getElementById(elementId);
    if (!(el instanceof HTMLSelectElement)) return;
    el.innerHTML = getMaterialRulesProductSelectOptionsHtml(selected, true);
  });
}

function getMaterialRulesDataWarnings() {
  const warnings = [];
  const catalogLoaded = materialRulesState.productMetaById.size > 0;
  const disallowed = new Set();
  const unknown = new Set();

  const addProductWarning = (productId) => {
    const pid = String(productId || '').trim();
    if (!pid) return;
    if (isMaterialRulesDisallowedProductId(pid)) disallowed.add(pid);
    if (catalogLoaded && !materialRulesState.productMetaById.has(pid)) unknown.add(pid);
  };

  (materialRulesState.templates || []).forEach((row) => addProductWarning(row?.product_id));
  const measured = materialRulesState.measuredRules || {};
  [
    measured.screw_product_id,
    measured.bracket_product_id_sc,
    measured.bracket_product_id_cl,
    measured.saddle_clip_product_id_65,
    measured.saddle_clip_product_id_80,
    measured.adjustable_clip_product_id_65,
    measured.adjustable_clip_product_id_80,
  ].forEach(addProductWarning);

  if (disallowed.size > 0) warnings.push(`Disallowed product IDs in current rules: ${Array.from(disallowed).sort().join(', ')}`);
  if (unknown.size > 0) warnings.push(`Unknown product IDs in current rules: ${Array.from(unknown).sort().join(', ')}`);
  return warnings;
}

let materialRulesLocalTemplateCounter = 0;

function getMaterialRulesDragHandleHtml(label) {
  return `
    <button
      type="button"
      class="material-rules-row-drag-handle"
      draggable="true"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
    >::</button>
  `;
}

function clearMaterialRulesDropTarget() {
  if (materialRulesDragState.dropTargetRow) {
    materialRulesDragState.dropTargetRow.classList.remove('material-rules-row--drop-target');
    materialRulesDragState.dropTargetRow = null;
  }
}

function resetMaterialRulesDragState() {
  if (materialRulesDragState.activeRow) {
    materialRulesDragState.activeRow.classList.remove('material-rules-row--dragging');
  }
  clearMaterialRulesDropTarget();
  materialRulesDragState.activeRow = null;
  materialRulesDragState.activeBody = null;
}

function getMaterialRulesDropTargetRow(tableBody, draggingRow, clientY) {
  const rows = Array.from(tableBody.querySelectorAll('tr')).filter((row) => row !== draggingRow);
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    if (clientY < midpoint) return row;
  }
  return null;
}

function setMaterialRulesDropTargetRow(row) {
  if (materialRulesDragState.dropTargetRow === row) return;
  clearMaterialRulesDropTarget();
  if (row) {
    row.classList.add('material-rules-row--drop-target');
    materialRulesDragState.dropTargetRow = row;
  }
}

function bindMaterialRulesTableRowReorder(tableBody) {
  if (!(tableBody instanceof HTMLElement) || tableBody.dataset.materialRulesDragBound === 'true') return;
  tableBody.dataset.materialRulesDragBound = 'true';

  tableBody.addEventListener('dragstart', (event) => {
    if (!isDesktopViewport()) return;
    const target = event.target instanceof Element ? event.target : null;
    const handle = target?.closest('.material-rules-row-drag-handle');
    if (!handle) return;
    const row = handle.closest('tr');
    if (!(row instanceof HTMLTableRowElement)) return;

    materialRulesDragState.activeRow = row;
    materialRulesDragState.activeBody = tableBody;
    row.classList.add('material-rules-row--dragging');
    clearMaterialRulesDropTarget();

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.repairTypeId || row.dataset.templateId || 'material-rules-row');
    }
  });

  tableBody.addEventListener('dragover', (event) => {
    if (!isDesktopViewport()) return;
    const activeRow = materialRulesDragState.activeRow;
    if (!(activeRow instanceof HTMLTableRowElement) || materialRulesDragState.activeBody !== tableBody) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const dropTarget = getMaterialRulesDropTargetRow(tableBody, activeRow, event.clientY);
    setMaterialRulesDropTargetRow(dropTarget);
  });

  tableBody.addEventListener('drop', (event) => {
    if (!isDesktopViewport()) return;
    const activeRow = materialRulesDragState.activeRow;
    if (!(activeRow instanceof HTMLTableRowElement) || materialRulesDragState.activeBody !== tableBody) return;

    event.preventDefault();
    const dropTarget = getMaterialRulesDropTargetRow(tableBody, activeRow, event.clientY);
    if (dropTarget) {
      tableBody.insertBefore(activeRow, dropTarget);
    } else {
      tableBody.appendChild(activeRow);
    }
    resetMaterialRulesDragState();
  });

  tableBody.addEventListener('dragend', () => {
    if (materialRulesDragState.activeBody === tableBody) resetMaterialRulesDragState();
  });
}

function appendMaterialRulesRepairTypeRow(row = {}) {
  const tbody = document.getElementById('materialRulesRepairTypesBody');
  if (!tbody) return;
  const id = String(row?.id || '').trim();
  const label = String(row?.label || '').trim();
  const requiresProfile = !!row?.requires_profile;
  const requiresSize = !!row?.requires_size_mm;
  const active = row?.active !== false;

  const tr = document.createElement('tr');
  tr.dataset.materialRulesRepairRow = 'true';
  tr.dataset.repairTypeId = id;
  tr.innerHTML = `
    <td class="material-rules-reorder-cell">
      ${getMaterialRulesDragHandleHtml('Drag to reorder repair type row')}
    </td>
    <td><input type="text" class="material-rules-repair-label" value="${escapeHtml(label)}" aria-label="Repair type label" /></td>
    <td><input type="checkbox" class="material-rules-repair-requires-profile" ${requiresProfile ? 'checked' : ''} aria-label="Requires profile" /></td>
    <td><input type="checkbox" class="material-rules-repair-requires-size" ${requiresSize ? 'checked' : ''} aria-label="Requires size" /></td>
    <td><input type="checkbox" class="material-rules-repair-active" ${active ? 'checked' : ''} aria-label="Active" /></td>
  `;
  tbody.appendChild(tr);
}

function appendMaterialRulesTemplateRow(row = {}, options = {}) {
  const tbody = options?.tbody instanceof HTMLTableSectionElement ? options.tbody : null;
  if (!tbody) return;

  const existingId = String(row?.id || '').trim();
  const localId = existingId || `new-${++materialRulesLocalTemplateCounter}`;
  const lockedRepairTypeId = String(options?.repairTypeId || row?.repair_type_id || '').trim();
  const productId = String(row?.product_id || '').trim();
  const qtyPerUnit = Number.isFinite(Number(row?.qty_per_unit)) ? Number(row.qty_per_unit) : 0;
  const conditionProfile = String(row?.condition_profile || '').trim().toUpperCase();
  const conditionSize = row?.condition_size_mm == null ? '' : String(row.condition_size_mm).trim();
  const rawLengthMode = String(row?.length_mode || 'none').trim().toLowerCase();
  const active = row?.active !== false;
  const legacyFixedLengthMm = Number.isFinite(Number(row?.fixed_length_mm)) ? parseInt(String(row.fixed_length_mm), 10) : null;
  const isLegacyFixedMm = rawLengthMode === 'fixed_mm' && Number.isFinite(legacyFixedLengthMm) && legacyFixedLengthMm > 0;
  const lengthMode = rawLengthMode === 'missing_measurement' || isLegacyFixedMm
    ? 'missing_measurement'
    : 'none';

  const tr = document.createElement('tr');
  tr.dataset.materialRulesTemplateRow = 'true';
  tr.dataset.templateId = localId;
  tr.dataset.repairTypeId = lockedRepairTypeId;
  tr.dataset.legacyFixedMm = isLegacyFixedMm ? 'true' : 'false';
  tr.dataset.legacyLengthMode = isLegacyFixedMm ? 'fixed_mm' : '';
  tr.dataset.legacyFixedLengthMm = isLegacyFixedMm ? String(legacyFixedLengthMm) : '';
  tr.dataset.rowDirty = 'false';
  tr.innerHTML = `
    <td>
      <select class="material-rules-template-product-id" aria-label="Template product ID">
        ${getMaterialRulesProductSelectOptionsHtml(productId, true)}
      </select>
    </td>
    <td><input type="number" class="material-rules-template-qty" min="0" step="0.001" value="${escapeHtml(String(qtyPerUnit))}" aria-label="Template quantity per unit" /></td>
    <td>
      <select class="material-rules-template-profile" aria-label="Template condition profile">
        <option value="" ${conditionProfile ? '' : 'selected'}>Any</option>
        <option value="SC" ${conditionProfile === 'SC' ? 'selected' : ''}>SC</option>
        <option value="CL" ${conditionProfile === 'CL' ? 'selected' : ''}>CL</option>
      </select>
    </td>
    <td>
      <select class="material-rules-template-size" aria-label="Template condition size">
        <option value="" ${conditionSize ? '' : 'selected'}>Any</option>
        <option value="65" ${conditionSize === '65' ? 'selected' : ''}>65mm</option>
        <option value="80" ${conditionSize === '80' ? 'selected' : ''}>80mm</option>
      </select>
    </td>
    <td>
      <select class="material-rules-template-length-mode" aria-label="Template length mode">
        <option value="none" ${lengthMode === 'none' ? 'selected' : ''}>No length</option>
        <option value="missing_measurement" ${lengthMode === 'missing_measurement' ? 'selected' : ''}>Ask for metres</option>
      </select>
      ${isLegacyFixedMm ? '<div class="material-rules-template-legacy-note">Legacy fixed_mm preserved until edited.</div>' : ''}
    </td>
    <td><input type="checkbox" class="material-rules-template-active" ${active ? 'checked' : ''} aria-label="Template active" /></td>
    <td class="material-rules-template-actions-cell">
      <button type="button" class="material-rules-row-remove-btn" aria-label="Remove template row">Remove</button>
    </td>
  `;

  const markRowDirty = () => {
    tr.dataset.rowDirty = 'true';
  };
  tr.querySelectorAll('input, select').forEach((control) => {
    if (!(control instanceof HTMLElement)) return;
    control.addEventListener('change', markRowDirty);
    if (control instanceof HTMLInputElement && control.type !== 'checkbox') {
      control.addEventListener('input', markRowDirty);
    }
  });

  const removeBtn = tr.querySelector('.material-rules-row-remove-btn');
  removeBtn?.addEventListener('click', () => {
    tr.remove();
  });

  tbody.appendChild(tr);
}

function renderMaterialRulesTemplateSections() {
  const groups = getMaterialRulesTemplateGroupsContainer();
  if (!groups) return;
  groups.innerHTML = '';
  const disableActions = materialRulesState.loading || materialRulesState.savingQuickQuoter || materialRulesState.savingMeasured;

  const fragment = document.createDocumentFragment();
  getMaterialRulesTemplateSections().forEach((section) => {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'material-rules-template-section';
    if (section.isUnknown) sectionEl.classList.add('material-rules-template-section--unknown');
    sectionEl.dataset.repairTypeId = section.repairTypeId;
    const sectionTitle = section.isUnknown
      ? `Unknown repair type: ${section.label}`
      : `${section.label} (${section.repairTypeId})`;
    sectionEl.innerHTML = `
      <div class="material-rules-template-section-head">
        <h4>${escapeHtml(sectionTitle)}</h4>
        ${section.isUnknown ? '' : `<button type="button" class="btn material-rules-add-template-btn" data-repair-type-id="${escapeHtml(section.repairTypeId)}" ${disableActions ? 'disabled' : ''}>Add Template</button>`}
      </div>
      <div class="material-rules-table-wrap">
        <table class="material-rules-table material-rules-table--templates" aria-label="Templates for ${escapeHtml(sectionTitle)}">
          <thead>
            <tr>
              <th scope="col">Product ID</th>
              <th scope="col">Qty/Unit</th>
              <th scope="col">Profile</th>
              <th scope="col">Size</th>
              <th scope="col">Length Mode</th>
              <th scope="col">Active</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody data-material-rules-template-section-body="true" data-repair-type-id="${escapeHtml(section.repairTypeId)}"></tbody>
        </table>
      </div>
    `;
    const tbody = sectionEl.querySelector('tbody[data-material-rules-template-section-body="true"]');
    if (tbody instanceof HTMLTableSectionElement) {
      section.rows.forEach((row) => appendMaterialRulesTemplateRow(row, {
        tbody,
        repairTypeId: section.repairTypeId,
      }));
    }
    fragment.appendChild(sectionEl);
  });

  groups.appendChild(fragment);
}

function renderMaterialRulesQuickQuoterTables() {
  const repairTypesBody = document.getElementById('materialRulesRepairTypesBody');
  const templateGroups = getMaterialRulesTemplateGroupsContainer();
  if (!repairTypesBody || !templateGroups) return;

  resetMaterialRulesDragState();
  repairTypesBody.innerHTML = '';
  templateGroups.innerHTML = '';

  const repairTypes = Array.isArray(materialRulesState.repairTypes) ? materialRulesState.repairTypes : [];

  repairTypes.forEach((row) => appendMaterialRulesRepairTypeRow(row));
  renderMaterialRulesTemplateSections();
}

function populateMaterialRulesMeasuredForm(rules) {
  const safe = rules || {};
  renderMaterialRulesMeasuredProductSelects(safe);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value == null ? '' : String(value);
  };

  setValue('materialRulesBracketSpacingMm', safe.bracket_spacing_mm);
  setValue('materialRulesClipSpacingMm', safe.clip_spacing_mm);
  setValue('materialRulesScrewsPerBracket', safe.screws_per_bracket);
  setValue('materialRulesScrewsPerDropper', safe.screws_per_dropper);
  setValue('materialRulesScrewsPerSaddleClip', safe.screws_per_saddle_clip);
  setValue('materialRulesScrewsPerAdjustableClip', safe.screws_per_adjustable_clip);
  setValue('materialRulesScrewProductId', safe.screw_product_id);
  setValue('materialRulesBracketProductIdSc', safe.bracket_product_id_sc);
  setValue('materialRulesBracketProductIdCl', safe.bracket_product_id_cl);
  setValue('materialRulesSaddleClipProductId65', safe.saddle_clip_product_id_65);
  setValue('materialRulesSaddleClipProductId80', safe.saddle_clip_product_id_80);
  setValue('materialRulesAdjustableClipProductId65', safe.adjustable_clip_product_id_65);
  setValue('materialRulesAdjustableClipProductId80', safe.adjustable_clip_product_id_80);
  setValue('materialRulesClipSelectionMode', safe.clip_selection_mode || 'auto_by_acl_presence');
}

function collectMaterialRulesRepairTypesPayload() {
  const rows = Array.from(document.querySelectorAll('#materialRulesRepairTypesBody tr[data-material-rules-repair-row="true"]'));
  const payload = [];
  const errors = [];
  const seenIds = new Set();

  if (rows.length === 0) {
    errors.push('Add at least one repair type row.');
    return { payload, errors };
  }

  rows.forEach((row, index) => {
    const id = String(row.dataset.repairTypeId || '').trim();
    const label = String(row.querySelector('.material-rules-repair-label')?.value || '').trim();
    const sortOrder = (index + 1) * MATERIAL_RULES_SORT_STEP;
    const requiresProfile = !!row.querySelector('.material-rules-repair-requires-profile')?.checked;
    const requiresSize = !!row.querySelector('.material-rules-repair-requires-size')?.checked;
    const active = !!row.querySelector('.material-rules-repair-active')?.checked;
    const rowNumber = index + 1;

    const duplicateId = !!id && seenIds.has(id);

    if (!id) errors.push(`Repair type row ${rowNumber}: ID is required.`);
    if (!label) errors.push(`Repair type row ${rowNumber}: Label is required.`);
    if (duplicateId) errors.push(`Repair type row ${rowNumber}: Duplicate ID '${id}'.`);
    if (id) seenIds.add(id);

    if (id && label && !duplicateId) {
      payload.push({
        id,
        label,
        active,
        sort_order: sortOrder,
        requires_profile: requiresProfile,
        requires_size_mm: requiresSize,
      });
    }
  });

  return { payload, errors };
}

function collectMaterialRulesTemplatesPayload() {
  const rows = Array.from(document.querySelectorAll('#materialRulesTemplateGroups tr[data-material-rules-template-row="true"]'));
  const payload = [];
  const errors = [];
  const seenIds = new Set();
  const sortOrderByRepairTypeId = new Map();

  rows.forEach((row, index) => {
    const localId = String(row.dataset.templateId || '').trim();
    const isPersistedId = !!localId && !localId.startsWith('new-');
    const duplicateTemplateId = isPersistedId && seenIds.has(localId);
    const repairTypeId = String(row.dataset.repairTypeId || '').trim();
    const productId = String(row.querySelector('.material-rules-template-product-id')?.value || '').trim();
    const qtyRaw = String(row.querySelector('.material-rules-template-qty')?.value || '').trim();
    const qtyPerUnit = parseFloat(qtyRaw);
    const conditionProfileValue = String(row.querySelector('.material-rules-template-profile')?.value || '').trim().toUpperCase();
    const conditionProfile = conditionProfileValue || null;
    const conditionSizeRaw = String(row.querySelector('.material-rules-template-size')?.value || '').trim();
    const conditionSize = conditionSizeRaw ? parseInt(conditionSizeRaw, 10) : null;
    const selectedLengthMode = String(row.querySelector('.material-rules-template-length-mode')?.value || 'none').trim().toLowerCase();
    const isLegacyFixedMm = row.dataset.legacyFixedMm === 'true';
    const rowDirty = row.dataset.rowDirty === 'true';
    const legacyFixedLength = parseInt(String(row.dataset.legacyFixedLengthMm || '').trim(), 10);
    const effectiveLengthMode = isLegacyFixedMm && !rowDirty ? 'fixed_mm' : selectedLengthMode;
    const effectiveFixedLength = effectiveLengthMode === 'fixed_mm' && Number.isFinite(legacyFixedLength) ? legacyFixedLength : null;
    const active = !!row.querySelector('.material-rules-template-active')?.checked;
    const sortOrder = (
      (sortOrderByRepairTypeId.get(repairTypeId) || 0)
      + MATERIAL_RULES_SORT_STEP
    );
    const rowNumber = index + 1;
    if (repairTypeId) sortOrderByRepairTypeId.set(repairTypeId, sortOrder);

    if (duplicateTemplateId) errors.push(`Template row ${rowNumber}: Duplicate template ID '${localId}'.`);
    if (isPersistedId) seenIds.add(localId);

    if (!repairTypeId) errors.push(`Template row ${rowNumber}: Repair type ID is required.`);
    if (!productId) errors.push(`Template row ${rowNumber}: Product ID is required.`);
    if (productId && isMaterialRulesDisallowedProductId(productId)) {
      errors.push(`Template row ${rowNumber}: Product ID '${productId}' is not allowed in Material Rules.`);
    }
    if (productId && materialRulesState.productMetaById.size > 0 && !materialRulesState.productMetaById.has(productId)) {
      errors.push(`Template row ${rowNumber}: Product ID '${productId}' is not in the current product catalog.`);
    }
    if (!Number.isFinite(qtyPerUnit) || qtyPerUnit < 0) errors.push(`Template row ${rowNumber}: Qty per unit must be a number >= 0.`);
    if (conditionProfile && conditionProfile !== 'SC' && conditionProfile !== 'CL') errors.push(`Template row ${rowNumber}: Profile must be SC, CL, or empty.`);
    if (conditionSize !== null && conditionSize !== 65 && conditionSize !== 80) errors.push(`Template row ${rowNumber}: Size must be 65, 80, or empty.`);
    if (!['none', 'missing_measurement'].includes(selectedLengthMode)) errors.push(`Template row ${rowNumber}: Length mode is invalid.`);
    if (effectiveLengthMode === 'fixed_mm' && (!Number.isFinite(effectiveFixedLength) || effectiveFixedLength <= 0)) {
      errors.push(`Template row ${rowNumber}: Legacy fixed_mm row has invalid fixed length.`);
    }

    if (
      repairTypeId
      && productId
      && Number.isFinite(qtyPerUnit)
      && qtyPerUnit >= 0
      && (!conditionProfile || conditionProfile === 'SC' || conditionProfile === 'CL')
      && (conditionSize === null || conditionSize === 65 || conditionSize === 80)
      && ['none', 'missing_measurement', 'fixed_mm'].includes(effectiveLengthMode)
      && (effectiveLengthMode !== 'fixed_mm' || (Number.isFinite(effectiveFixedLength) && effectiveFixedLength > 0))
      && !duplicateTemplateId
    ) {
      const template = {
        repair_type_id: repairTypeId,
        product_id: productId,
        qty_per_unit: qtyPerUnit,
        condition_profile: conditionProfile,
        condition_size_mm: conditionSize,
        length_mode: effectiveLengthMode,
        fixed_length_mm: effectiveLengthMode === 'fixed_mm' ? effectiveFixedLength : null,
        active,
        sort_order: sortOrder,
      };
      if (isPersistedId) template.id = localId;
      payload.push(template);
    }
  });

  return { payload, errors };
}

function collectMaterialRulesMeasuredPayload() {
  const intValue = (id) => parseInt(String(document.getElementById(id)?.value || '').trim(), 10);
  const textValue = (id) => String(document.getElementById(id)?.value || '').trim();

  const payload = {
    bracket_spacing_mm: intValue('materialRulesBracketSpacingMm'),
    clip_spacing_mm: intValue('materialRulesClipSpacingMm'),
    screws_per_bracket: intValue('materialRulesScrewsPerBracket'),
    screws_per_dropper: intValue('materialRulesScrewsPerDropper'),
    screws_per_saddle_clip: intValue('materialRulesScrewsPerSaddleClip'),
    screws_per_adjustable_clip: intValue('materialRulesScrewsPerAdjustableClip'),
    screw_product_id: textValue('materialRulesScrewProductId'),
    bracket_product_id_sc: textValue('materialRulesBracketProductIdSc'),
    bracket_product_id_cl: textValue('materialRulesBracketProductIdCl'),
    saddle_clip_product_id_65: textValue('materialRulesSaddleClipProductId65'),
    saddle_clip_product_id_80: textValue('materialRulesSaddleClipProductId80'),
    adjustable_clip_product_id_65: textValue('materialRulesAdjustableClipProductId65'),
    adjustable_clip_product_id_80: textValue('materialRulesAdjustableClipProductId80'),
    clip_selection_mode: String(document.getElementById('materialRulesClipSelectionMode')?.value || '').trim(),
  };

  const errors = [];

  if (!Number.isFinite(payload.bracket_spacing_mm) || payload.bracket_spacing_mm <= 0) errors.push('Bracket spacing must be an integer > 0.');
  if (!Number.isFinite(payload.clip_spacing_mm) || payload.clip_spacing_mm <= 0) errors.push('Clip spacing must be an integer > 0.');
  if (!Number.isFinite(payload.screws_per_bracket) || payload.screws_per_bracket < 0) errors.push('Screws per bracket must be an integer >= 0.');
  if (!Number.isFinite(payload.screws_per_dropper) || payload.screws_per_dropper < 0) errors.push('Screws per dropper must be an integer >= 0.');
  if (!Number.isFinite(payload.screws_per_saddle_clip) || payload.screws_per_saddle_clip < 0) errors.push('Screws per saddle clip must be an integer >= 0.');
  if (!Number.isFinite(payload.screws_per_adjustable_clip) || payload.screws_per_adjustable_clip < 0) errors.push('Screws per adjustable clip must be an integer >= 0.');

  [
    ['screw_product_id', 'Screw product ID'],
    ['bracket_product_id_sc', 'Bracket product (SC)'],
    ['bracket_product_id_cl', 'Bracket product (CL)'],
    ['saddle_clip_product_id_65', 'Saddle clip product (65)'],
    ['saddle_clip_product_id_80', 'Saddle clip product (80)'],
    ['adjustable_clip_product_id_65', 'Adjustable clip product (65)'],
    ['adjustable_clip_product_id_80', 'Adjustable clip product (80)'],
  ].forEach(([field, label]) => {
    if (!payload[field]) errors.push(`${label} is required.`);
    if (payload[field] && isMaterialRulesDisallowedProductId(payload[field])) {
      errors.push(`${label} cannot use '${payload[field]}' in Material Rules.`);
    }
    if (payload[field] && materialRulesState.productMetaById.size > 0 && !materialRulesState.productMetaById.has(payload[field])) {
      errors.push(`${label} '${payload[field]}' is not in the current product catalog.`);
    }
  });

  if (!['auto_by_acl_presence', 'force_saddle', 'force_adjustable'].includes(payload.clip_selection_mode)) {
    errors.push('Clip selection mode is invalid.');
  }

  return { payload, errors };
}

async function fetchMaterialRules(options = {}) {
  if (!canAccessDesktopAdminUi()) {
    setMaterialRulesStatus(
      isDesktopViewport()
        ? 'Only admin users can load material rules.'
        : 'Material Rules is available on desktop only.',
      'error'
    );
    return;
  }
  if (!options.force && getVisibleViewId() !== 'view-material-rules') return;

  materialRulesState.loading = true;
  updateMaterialRulesActionButtons();
  setMaterialRulesStatus('Loading material rules…');

  const productsPromise = fetch('/api/products', { cache: 'no-store' })
    .then((resp) => resp.json().catch(() => ({})))
    .then((payload) => (Array.isArray(payload?.products) ? payload.products : []))
    .catch(() => []);

  try {
    const [quickQuoterResp, measuredResp, products] = await Promise.all([
      fetch('/api/admin/material-rules/quick-quoter', { headers: { ...getAuthHeaders() } }),
      fetch('/api/admin/material-rules/measured', { headers: { ...getAuthHeaders() } }),
      productsPromise,
    ]);

    if (handleAuthFailure(quickQuoterResp) || handleAuthFailure(measuredResp)) return;

    const [quickQuoterPayload, measuredPayload] = await Promise.all([
      quickQuoterResp.json().catch(() => ({})),
      measuredResp.json().catch(() => ({})),
    ]);

    if (!quickQuoterResp.ok) {
      throw new Error(getMaterialRulesApiError(quickQuoterPayload, 'Failed to load quick quoter rules.'));
    }
    if (!measuredResp.ok) {
      throw new Error(getMaterialRulesApiError(measuredPayload, 'Failed to load measured rules.'));
    }

    materialRulesState.repairTypes = Array.isArray(quickQuoterPayload?.repair_types) ? quickQuoterPayload.repair_types : [];
    materialRulesState.templates = Array.isArray(quickQuoterPayload?.templates) ? quickQuoterPayload.templates : [];
    materialRulesState.measuredRules = measuredPayload?.rules || null;
    materialRulesState.productMetaById = new Map(
      (Array.isArray(products) ? products : [])
        .map((product) => {
          const id = String(product?.id || '').trim();
          if (!id) return null;
          return [id, product];
        })
        .filter(Boolean)
    );

    const productIdsFromApi = (Array.isArray(products) ? products : [])
      .map((p) => String(p?.id || '').trim())
      .filter(Boolean);
    const productIdsFromTemplates = materialRulesState.templates
      .map((row) => String(row?.product_id || '').trim())
      .filter(Boolean);
    const measured = materialRulesState.measuredRules || {};
    const productIdsFromMeasured = [
      measured.screw_product_id,
      measured.bracket_product_id_sc,
      measured.bracket_product_id_cl,
      measured.saddle_clip_product_id_65,
      measured.saddle_clip_product_id_80,
      measured.adjustable_clip_product_id_65,
      measured.adjustable_clip_product_id_80,
    ].map((id) => String(id || '').trim()).filter(Boolean);
    materialRulesState.productIds = Array.from(new Set([
      ...productIdsFromApi,
      ...productIdsFromTemplates,
      ...productIdsFromMeasured,
    ]));

    renderMaterialRulesQuickQuoterTables();
    populateMaterialRulesMeasuredForm(materialRulesState.measuredRules || {});
    const warnings = getMaterialRulesDataWarnings();
    if (warnings.length > 0) {
      setMaterialRulesStatus(`Warning: ${warnings.join(' ')}`, 'error');
    } else {
      setMaterialRulesStatus(options.showSuccess ? 'Material rules loaded.' : '');
    }
  } catch (err) {
    setMaterialRulesStatus(err?.message || 'Failed to load material rules.', 'error');
  } finally {
    materialRulesState.loading = false;
    updateMaterialRulesActionButtons();
  }
}

async function saveMaterialRulesQuickQuoter() {
  if (!canAccessDesktopAdminUi()) {
    setMaterialRulesStatus('Only admin users can save material rules.', 'error');
    return;
  }

  const repairTypeResult = collectMaterialRulesRepairTypesPayload();
  if (repairTypeResult.errors.length > 0) {
    setMaterialRulesStatus(repairTypeResult.errors[0], 'error');
    return;
  }
  const templateResult = collectMaterialRulesTemplatesPayload();
  if (templateResult.errors.length > 0) {
    setMaterialRulesStatus(templateResult.errors[0], 'error');
    return;
  }

  materialRulesState.savingQuickQuoter = true;
  updateMaterialRulesActionButtons();
  setMaterialRulesStatus('Saving quick quoter rules…');

  try {
    const repairTypesResp = await fetch('/api/admin/material-rules/quick-quoter/repair-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ repair_types: repairTypeResult.payload }),
    });
    if (handleAuthFailure(repairTypesResp)) return;
    const repairTypesPayload = await repairTypesResp.json().catch(() => ({}));
    if (!repairTypesResp.ok) {
      throw new Error(getMaterialRulesApiError(repairTypesPayload, 'Failed to save repair types.'));
    }

    const templatesResp = await fetch('/api/admin/material-rules/quick-quoter/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ templates: templateResult.payload }),
    });
    if (handleAuthFailure(templatesResp)) return;
    const templatesPayload = await templatesResp.json().catch(() => ({}));
    if (!templatesResp.ok) {
      throw new Error(getMaterialRulesApiError(templatesPayload, 'Failed to save templates.'));
    }

    materialRulesState.repairTypes = Array.isArray(repairTypesPayload?.repair_types) ? repairTypesPayload.repair_types : [];
    materialRulesState.templates = Array.isArray(templatesPayload?.templates) ? templatesPayload.templates : [];
    renderMaterialRulesQuickQuoterTables();
    setMaterialRulesStatus('Quick Quoter rules saved.', 'success');
    showMessage('Quick Quoter rules saved.', 'success');
    void fetchQuickQuoterCatalog();
  } catch (err) {
    setMaterialRulesStatus(err?.message || 'Failed to save quick quoter rules.', 'error');
  } finally {
    materialRulesState.savingQuickQuoter = false;
    updateMaterialRulesActionButtons();
  }
}

async function saveMaterialRulesMeasured() {
  if (!canAccessDesktopAdminUi()) {
    setMaterialRulesStatus('Only admin users can save material rules.', 'error');
    return;
  }

  const measuredResult = collectMaterialRulesMeasuredPayload();
  if (measuredResult.errors.length > 0) {
    setMaterialRulesStatus(measuredResult.errors[0], 'error');
    return;
  }

  materialRulesState.savingMeasured = true;
  updateMaterialRulesActionButtons();
  setMaterialRulesStatus('Saving measured rules…');

  try {
    const resp = await fetch('/api/admin/material-rules/measured', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ rules: measuredResult.payload }),
    });
    if (handleAuthFailure(resp)) return;
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(getMaterialRulesApiError(payload, 'Failed to save measured rules.'));
    }
    materialRulesState.measuredRules = payload?.rules || measuredResult.payload;
    populateMaterialRulesMeasuredForm(materialRulesState.measuredRules || {});
    setMaterialRulesStatus('Measured rules saved.', 'success');
    showMessage('Measured rules saved.', 'success');
  } catch (err) {
    setMaterialRulesStatus(err?.message || 'Failed to save measured rules.', 'error');
  } finally {
    materialRulesState.savingMeasured = false;
    updateMaterialRulesActionButtons();
  }
}

function initMaterialRulesView() {
  if (materialRulesState.initialized) return;
  materialRulesState.initialized = true;

  const backBtn = document.getElementById('btnMaterialRulesBackToCanvas');
  const reloadBtn = document.getElementById('btnMaterialRulesReload');
  const saveQuickQuoterBtn = document.getElementById('btnMaterialRulesSaveQuickQuoter');
  const saveMeasuredBtn = document.getElementById('btnMaterialRulesSaveMeasured');
  const repairTypesBody = document.getElementById('materialRulesRepairTypesBody');
  const templateGroups = getMaterialRulesTemplateGroupsContainer();

  backBtn?.addEventListener('click', () => {
    switchView('view-canvas', { triggerEl: backBtn });
  });

  reloadBtn?.addEventListener('click', () => {
    void fetchMaterialRules({ force: true, showSuccess: true });
  });

  saveQuickQuoterBtn?.addEventListener('click', () => {
    void saveMaterialRulesQuickQuoter();
  });

  saveMeasuredBtn?.addEventListener('click', () => {
    void saveMaterialRulesMeasured();
  });

  templateGroups?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const addBtn = target?.closest('.material-rules-add-template-btn');
    if (!(addBtn instanceof HTMLButtonElement)) return;
    const section = addBtn.closest('.material-rules-template-section');
    const tbody = section?.querySelector('tbody[data-material-rules-template-section-body="true"]');
    const repairTypeId = String(addBtn.dataset.repairTypeId || section?.dataset.repairTypeId || '').trim();
    if (!(tbody instanceof HTMLTableSectionElement) || !repairTypeId) return;
    appendMaterialRulesTemplateRow({
      id: '',
      repair_type_id: repairTypeId,
      product_id: '',
      qty_per_unit: 0,
      condition_profile: null,
      condition_size_mm: null,
      length_mode: 'none',
      fixed_length_mm: null,
      active: true,
      sort_order: 0,
    }, {
      tbody,
      repairTypeId,
    });
  });

  bindMaterialRulesTableRowReorder(repairTypesBody);

  updateMaterialRulesActionButtons();
}

function setBonusDashboardStatus(message, tone = 'info') {
  const el = document.getElementById('bonusDashboardStatus');
  if (!el) return;
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.remove('permissions-status--error', 'permissions-status--success');
  if (tone === 'error') el.classList.add('permissions-status--error');
  if (tone === 'success') el.classList.add('permissions-status--success');
}

function formatBonusDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Dates not available';
  const startText = start.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  const endText = end.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  return `${startText} - ${endText}`;
}

function formatBonusDateTime(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Date unavailable';
  return dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatBonusStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'UNKNOWN';
  return normalized.toUpperCase();
}

function shouldReduceBonusMotion() {
  if (document.body?.classList.contains('a11y-force-motion')) return false;
  if (document.body?.classList.contains('a11y-reduce-motion')) return true;
  try {
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

function getBonusDisplayName(payload) {
  const explicit = String(payload?.technician_context?.display_name || '').trim();
  if (explicit) return explicit;
  const fullName = String(authState.user?.user_metadata?.full_name || '').trim();
  if (fullName) return fullName;
  return String(authState.email || 'You').trim();
}

function getBonusInitials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '??';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatBonusPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0%';
  return `${Math.max(0, Math.min(100, n * 100)).toFixed(1)}%`;
}

function animateBonusCurrencyValue(el, fromValue, toValue, durationMs = 680) {
  if (!(el instanceof HTMLElement)) return;
  const start = Number(fromValue || 0);
  const end = Number(toValue || 0);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    el.textContent = formatCurrency(toValue || 0);
    return;
  }
  if (shouldReduceBonusMotion() || start === end) {
    el.textContent = formatCurrency(end);
    return;
  }
  if (el.__bonusAnimFrameId) cancelAnimationFrame(el.__bonusAnimFrameId);
  const startTs = performance.now();
  const tick = (ts) => {
    const p = Math.min(1, (ts - startTs) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    const next = start + (end - start) * eased;
    el.textContent = formatCurrency(next);
    if (p < 1) {
      el.__bonusAnimFrameId = requestAnimationFrame(tick);
    } else {
      el.__bonusAnimFrameId = 0;
      el.textContent = formatCurrency(end);
    }
  };
  el.__bonusAnimFrameId = requestAnimationFrame(tick);
}

function animateBonusCurrencySlotValue(el, toValue, durationMs = 560) {
  if (!(el instanceof HTMLElement)) return;
  const end = Number(toValue || 0);
  if (!Number.isFinite(end)) {
    el.textContent = formatCurrency(toValue || 0);
    return;
  }
  if (shouldReduceBonusMotion()) {
    el.textContent = formatCurrency(end);
    return;
  }
  if (end < 0) {
    animateBonusCurrencyValue(el, 0, end, durationMs);
    return;
  }
  if (el.__bonusAnimFrameId) cancelAnimationFrame(el.__bonusAnimFrameId);
  const startTs = performance.now();
  const fastTarget = end * 0.9;
  const stepSize = end >= 500 ? 25 : end >= 100 ? 5 : end >= 20 ? 1 : end >= 5 ? 0.25 : 0.05;
  const tick = (ts) => {
    const p = Math.min(1, (ts - startTs) / durationMs);
    let next = 0;
    if (p < 0.72) {
      const fast = Math.pow(p / 0.72, 0.42);
      next = fastTarget * fast;
    } else {
      const settle = (p - 0.72) / 0.28;
      const easedSettle = 1 - Math.pow(1 - settle, 3);
      next = fastTarget + ((end - fastTarget) * easedSettle);
    }
    if (p < 0.96) next = Math.round(next / stepSize) * stepSize;
    next = Math.max(0, Math.min(end, next));
    el.textContent = formatCurrency(next);
    if (p < 1) {
      el.__bonusAnimFrameId = requestAnimationFrame(tick);
    } else {
      el.__bonusAnimFrameId = 0;
      el.textContent = formatCurrency(end);
    }
  };
  el.__bonusAnimFrameId = requestAnimationFrame(tick);
}

function setBonusCurrencyValue(el, value, options = {}) {
  if (!(el instanceof HTMLElement)) return;
  const next = Number(value || 0);
  const currentRaw = Number(el.dataset.currencyValue || 0);
  const current = Number.isFinite(currentRaw) ? currentRaw : 0;
  const shouldAnimate = options.animate === true && !shouldReduceBonusMotion();
  if (shouldAnimate) {
    animateBonusCurrencyValue(el, Number.isFinite(options.from) ? Number(options.from) : current, next);
  } else {
    el.textContent = formatCurrency(next);
  }
  el.dataset.currencyValue = String(next);
}

function hideBonusTooltip() {
  const tooltipEl = document.getElementById('bonusBadgeTooltip');
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
  tooltipEl.textContent = '';
}

function showBonusTooltip(targetEl, tooltipText) {
  const tooltipEl = document.getElementById('bonusBadgeTooltip');
  if (!(targetEl instanceof HTMLElement) || !tooltipEl) return;
  const text = String(tooltipText || '').trim();
  if (!text) {
    hideBonusTooltip();
    return;
  }
  tooltipEl.textContent = text;
  tooltipEl.hidden = false;
  tooltipEl.style.left = '0px';
  tooltipEl.style.top = '0px';
  const tipRect = tooltipEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  let left = targetRect.left + (targetRect.width / 2) - (tipRect.width / 2);
  left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left));
  let top = targetRect.top - tipRect.height - 8;
  if (top < 8) top = targetRect.bottom + 8;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function bindBonusTooltipInteractions() {
  if (technicianBonusState.tooltipBound) return;
  technicianBonusState.tooltipBound = true;
  const root = document.getElementById('view-technician-bonus');
  if (!root) return;
  const resolveTarget = (node) => {
    if (!(node instanceof Element)) return null;
    return node.closest('[data-bonus-tooltip]');
  };
  root.addEventListener('mouseover', (e) => {
    const target = resolveTarget(e.target);
    if (!target) return;
    showBonusTooltip(target, target.getAttribute('data-bonus-tooltip') || '');
  });
  root.addEventListener('mouseout', (e) => {
    const target = resolveTarget(e.target);
    if (!target) return;
    hideBonusTooltip();
  });
  root.addEventListener('focusin', (e) => {
    const target = resolveTarget(e.target);
    if (!target) return;
    showBonusTooltip(target, target.getAttribute('data-bonus-tooltip') || '');
  });
  root.addEventListener('focusout', (e) => {
    const target = resolveTarget(e.target);
    if (!target) return;
    hideBonusTooltip();
  });
  root.addEventListener('click', (e) => {
    const target = resolveTarget(e.target);
    if (!target) {
      hideBonusTooltip();
      return;
    }
    e.preventDefault();
    const tooltipText = target.getAttribute('data-bonus-tooltip') || '';
    showBonusTooltip(target, tooltipText);
  });
}

function bindBonusTallyInteractions() {
  if (technicianBonusState.tallyBound) return;
  technicianBonusState.tallyBound = true;
  const replay = (el, options = {}) => {
    if (!(el instanceof HTMLElement)) return;
    const finalValue = Number(el.dataset.currencyValue || 0);
    if (options.mode === 'slot') {
      animateBonusCurrencySlotValue(el, finalValue, options.durationMs || 560);
      return;
    }
    animateBonusCurrencyValue(el, 0, finalValue, options.durationMs || 720);
  };
  const potBtn = document.getElementById('bonusPotTallyBtn');
  const myGpBtn = document.getElementById('bonusMyGpTallyBtn');
  const teamPotValueEl = document.getElementById('bonusRaceTeamPotValue');
  const myGpValueEl = document.getElementById('bonusRaceMyGpValue');
  if (teamPotValueEl) {
    teamPotValueEl.addEventListener('click', () => replay(teamPotValueEl, { mode: 'slot', durationMs: 560 }));
    teamPotValueEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      replay(teamPotValueEl, { mode: 'slot', durationMs: 560 });
    });
  }
  if (myGpValueEl) {
    myGpValueEl.addEventListener('click', () => replay(myGpValueEl));
    myGpValueEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      replay(myGpValueEl);
    });
  }
  potBtn?.addEventListener('click', () => replay(teamPotValueEl, { mode: 'slot', durationMs: 560 }));
  myGpBtn?.addEventListener('click', () => replay(myGpValueEl));
  const teamPotDesktopEl = document.getElementById('bonusHeroTeamPot');
  if (teamPotDesktopEl) {
    teamPotDesktopEl.addEventListener('click', () => replay(teamPotDesktopEl, { mode: 'slot', durationMs: 560 }));
    teamPotDesktopEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      replay(teamPotDesktopEl, { mode: 'slot', durationMs: 560 });
    });
  }
}

function announceBonusRace(message) {
  const announcer = document.getElementById('bonusRaceAnnouncer');
  if (!announcer) return;
  announcer.textContent = '';
  announcer.textContent = String(message || '');
}

/** First name or "First L." from display name for Race cards (mobile). Never show raw email. */
function bonusRaceFirstName(displayName) {
  const s = String(displayName || '').trim();
  if (!s) return '—';
  if (s.includes('@')) {
    const local = s.split('@')[0].trim();
    if (!local) return '—';
    const segments = local.split(/[._-]+/).filter(Boolean);
    if (segments.length === 0) return '—';
    const first = segments[0];
    const title = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    if (segments.length === 1) return title;
    return title + ' ' + (segments[1].charAt(0).toUpperCase()) + '.';
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + (parts[1] ? parts[1].charAt(0) + '.' : '');
}

/** Avatar background palette for Race (mobile). */
const BONUS_RACER_AVATAR_COLORS = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];

function getLeaderboardRowsForCategory(payload, category) {
  const list = category === 'executors' && Array.isArray(payload?.leaderboard_executors)
    ? payload.leaderboard_executors
    : category === 'sellers' && Array.isArray(payload?.leaderboard_sellers)
      ? payload.leaderboard_sellers
      : Array.isArray(payload?.leaderboard)
        ? payload.leaderboard
        : [];
  if (list.length > 0) {
    return list
      .map((row, idx) => ({
        technician_id: String(row?.technician_id || `row-${idx}`),
        display_name: String(row?.display_name || row?.avatar_initials || `Tech ${idx + 1}`),
        avatar_initials: String(row?.avatar_initials || ''),
        gp_contributed: Number(row?.gp_contributed || 0),
        share_of_team_pot: Number(row?.share_of_team_pot || 0),
        rank: Number(row?.rank || (idx + 1)),
        placeholder: false,
      }))
      .sort((a, b) => a.rank - b.rank);
  }
  return buildBonusLeaderboardRows(payload);
}

function buildBonusLeaderboardRows(payload) {
  const leaderboard = Array.isArray(payload?.leaderboard) ? payload.leaderboard.slice() : [];
  if (leaderboard.length > 0) {
    return leaderboard
      .map((row, idx) => ({
        technician_id: String(row?.technician_id || `row-${idx}`),
        display_name: String(row?.display_name || row?.avatar_initials || `Tech ${idx + 1}`),
        avatar_initials: String(row?.avatar_initials || ''),
        gp_contributed: Number(row?.gp_contributed || 0),
        share_of_team_pot: Number(row?.share_of_team_pot || 0),
        rank: Number(row?.rank || (idx + 1)),
        placeholder: false,
      }))
      .sort((a, b) => a.rank - b.rank);
  }

  const hero = payload?.hero || {};
  const teamPot = Number(hero?.total_team_pot || 0);
  const teamGp = teamPot > 0 ? teamPot / 0.10 : 0;
  const myGp = Number(hero?.my_total_gp_contributed || 0);
  const selfShare = teamGp > 0 ? myGp / teamGp : 0;
  const myName = getBonusDisplayName(payload);
  return [
    {
      technician_id: String(payload?.technician_context?.technician_id || 'self'),
      display_name: myName,
      avatar_initials: getBonusInitials(myName),
      gp_contributed: myGp,
      share_of_team_pot: selfShare,
      rank: 1,
      placeholder: false,
    },
    {
      technician_id: 'placeholder-rank-2',
      display_name: 'Challenger Slot',
      avatar_initials: '--',
      gp_contributed: 0,
      share_of_team_pot: 0,
      rank: 2,
      placeholder: true,
    },
    {
      technician_id: 'placeholder-rank-3',
      display_name: 'Challenger Slot',
      avatar_initials: '--',
      gp_contributed: 0,
      share_of_team_pot: 0,
      rank: 3,
      placeholder: true,
    },
  ];
}

function renderBonusRaceBoard(payload) {
  const teamPot = Number(payload?.hero?.total_team_pot || 0);
  const myGp = Number(payload?.hero?.my_total_gp_contributed || 0);
  const previousPot = Number.isFinite(technicianBonusState.lastTeamPot) ? technicianBonusState.lastTeamPot : null;
  const previousMyGp = Number(technicianBonusState.previousPayload?.hero?.my_total_gp_contributed || 0);
  const delta = previousPot == null ? 0 : Math.round((teamPot - previousPot) * 100) / 100;
  technicianBonusState.potPeak = Math.max(technicianBonusState.potPeak || 1, teamPot || 0, previousPot || 0, 1);
  const fillPercent = Math.max(0, Math.min(100, (teamPot / technicianBonusState.potPeak) * 100));
  const heatZone = fillPercent <= 30 ? 'cold' : fillPercent <= 70 ? 'warm' : 'hot';
  const heatColor = heatZone === 'cold' ? '#3B82F6' : heatZone === 'warm' ? '#F97316' : '#EF4444';
  const gaugeEl = document.getElementById('bonusRacePotGauge');
  const deltaEl = document.getElementById('bonusRacePotDelta');
  const updatedEl = document.getElementById('bonusRaceLastUpdated');
  const teamPotMobileEl = document.getElementById('bonusRaceTeamPotValue');
  const myGpMobileEl = document.getElementById('bonusRaceMyGpValue');

  if (gaugeEl) {
    gaugeEl.style.setProperty('--fill-percentage', fillPercent.toFixed(2));
    gaugeEl.style.setProperty('--gauge-color', heatColor);
    gaugeEl.dataset.heat = heatZone;
    gaugeEl.setAttribute('aria-label', `Team pot gauge ${Math.round(fillPercent)} percent filled`);
  }
  if (deltaEl) {
    if (delta > 0) {
      deltaEl.textContent = `+${formatCurrency(delta)} added to the Team Pool.`;
      deltaEl.dataset.tone = 'gain';
    } else if (delta < 0) {
      deltaEl.textContent = `Leak detected: ${formatCurrency(Math.abs(delta))} drained from the Team Pool.`;
      deltaEl.dataset.tone = 'leak';
    } else {
      deltaEl.textContent = 'No Team Pool movement since last update.';
      deltaEl.dataset.tone = 'neutral';
    }
  }
  if (updatedEl) {
    updatedEl.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  setBonusCurrencyValue(teamPotMobileEl, teamPot, { animate: previousPot != null, from: previousPot ?? 0 });
  setBonusCurrencyValue(myGpMobileEl, myGp, { animate: Number.isFinite(previousMyGp), from: previousMyGp || 0 });

  const heroPotGaugeEl = document.getElementById('bonusHeroPotGauge');
  const teamPotDesktopEl = document.getElementById('bonusHeroTeamPot');
  if (heroPotGaugeEl) {
    heroPotGaugeEl.style.setProperty('--fill-percentage', fillPercent.toFixed(2));
    heroPotGaugeEl.style.setProperty('--gauge-color', heatColor);
    heroPotGaugeEl.dataset.heat = heatZone;
    heroPotGaugeEl.setAttribute('aria-label', `Team pot gauge ${Math.round(fillPercent)} percent filled`);
  }
  setBonusCurrencyValue(teamPotDesktopEl, teamPot, { animate: previousPot != null, from: previousPot ?? 0 });

  if (delta > 0) announceBonusRace(`Team pool increased by ${formatCurrency(delta)}.`);
  if (delta < 0) announceBonusRace(`Team pool decreased by ${formatCurrency(Math.abs(delta))}.`);
  technicianBonusState.lastTeamPot = teamPot;
}

function renderBonusRaceLeaderboard(payload) {
  const listEl = document.getElementById('bonusRaceLeaderboard');
  if (!listEl) return;
  const isMobile = document.body?.getAttribute('data-viewport-mode') === 'mobile';
  const category = technicianBonusState.raceCategory || 'sellers';
  const rows = isMobile ? getLeaderboardRowsForCategory(payload, category) : buildBonusLeaderboardRows(payload);
  const nextRanks = new Map();

  /* Mobile: show category toggle and bind; render gamified rows */
  const toggleWrap = document.getElementById('bonusRaceCategoryToggleWrap');
  if (toggleWrap) {
    if (isMobile) {
      toggleWrap.hidden = false;
      const sellersBtn = document.getElementById('bonusRaceCategorySellers');
      const executorsBtn = document.getElementById('bonusRaceCategoryExecutors');
      if (sellersBtn) {
        sellersBtn.setAttribute('aria-pressed', category === 'sellers' ? 'true' : 'false');
      }
      if (executorsBtn) {
        executorsBtn.setAttribute('aria-pressed', category === 'executors' ? 'true' : 'false');
      }
      if (!technicianBonusState.raceCategoryToggleBound) {
        technicianBonusState.raceCategoryToggleBound = true;
        sellersBtn?.addEventListener('click', () => {
          technicianBonusState.raceCategory = 'sellers';
          renderBonusRaceLeaderboard(technicianBonusState.payload);
        });
        executorsBtn?.addEventListener('click', () => {
          technicianBonusState.raceCategory = 'executors';
          renderBonusRaceLeaderboard(technicianBonusState.payload);
        });
      }
    } else {
      toggleWrap.hidden = true;
    }
  }

  if (isMobile) {
    listEl.style.opacity = '0';
    listEl.innerHTML = rows.map((row, index) => {
      const rank = Number(row?.rank || (index + 1));
      const id = String(row?.technician_id || `row-${index}`);
      const prevRank = technicianBonusState.lastRanks.get(id);
      const changedRank = Number.isFinite(prevRank) && prevRank !== rank;
      nextRanks.set(id, rank);
      const initials = String(row?.avatar_initials || getBonusInitials(row?.display_name || '') || '--');
      const firstName = bonusRaceFirstName(row?.display_name);
      const gp = Number(row?.gp_contributed || 0);
      const avatarColor = BONUS_RACER_AVATAR_COLORS[(rank - 1) % BONUS_RACER_AVATAR_COLORS.length];
      const isKing = rank === 1 && !row.placeholder;
      const isPlaceholder = !!row.placeholder;
      const isContender = rank >= 2 && !row.placeholder;
      const rowAbove = index > 0 ? rows[index - 1] : null;
      const gpAbove = rowAbove ? Number(rowAbove.gp_contributed || 0) : 0;
      const gap = Math.max(0, gpAbove - gp);
      let catchUpHtml = '';
      if (isContender && rowAbove) {
        const rankLabel = rowAbove.rank === 1 ? '1st' : rowAbove.rank === 2 ? '2nd' : `${rowAbove.rank}th`;
        if (rowAbove.rank === 1) {
          catchUpHtml = gap > 0
            ? `<div class="bonus-racer-catch-up">🔥 Only ${escapeHtml(formatCurrency(gap))} behind 1st place!</div>`
            : '';
        } else {
          catchUpHtml = gap > 0
            ? `<div class="bonus-racer-catch-up">Keep pushing! ${escapeHtml(formatCurrency(gap))} to overtake ${rankLabel}.</div>`
            : '';
        }
      }
      const rankLabelA11y = rank === 1 ? 'Rank 1' : rank === 2 ? 'Rank 2' : rank === 3 ? 'Rank 3' : `Rank ${rank}`;
      const cardRole = isPlaceholder ? null : 'button';
      const tabIndex = isPlaceholder ? -1 : 0;
      const cardClass = [
        'bonus-racer',
        changedRank ? 'bonus-racer--overtake' : '',
        isKing ? 'bonus-racer--king' : '',
        isContender ? 'bonus-racer--contender' : '',
        isPlaceholder ? 'bonus-racer--placeholder' : '',
      ].filter(Boolean).join(' ');
      if (isPlaceholder) {
        return `<li class="${cardClass}" data-rank="${rank}" data-placeholder="true">
          <div class="bonus-racer-top">
            <div class="bonus-racer-left">
              <span class="bonus-racer-rank" aria-label="${rankLabelA11y}">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</span>
              <span class="bonus-racer-avatar" style="background: #94a3b8;">${escapeHtml(initials)}</span>
              <span class="bonus-racer-name">—</span>
            </div>
            <span class="bonus-racer-gp bonus-racer-gp--major">${escapeHtml(formatCurrency(0))}</span>
          </div>
          <p class="bonus-racer-slot-open">Slot open. Close a deal to claim this spot!</p>
        </li>`;
      }
      return `<li class="${cardClass}" data-rank="${rank}" ${cardRole ? `role="${cardRole}" tabindex="${tabIndex}"` : ''} data-technician-id="${escapeHtml(id)}">
        <div class="bonus-racer-top">
          <div class="bonus-racer-left">
            <span class="bonus-racer-rank" aria-hidden="true">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</span>
            <div class="bonus-racer-avatar-wrap">
              ${isKing ? '<span class="bonus-racer-crown" aria-hidden="true">👑</span>' : ''}
              <span class="bonus-racer-avatar" style="background: ${escapeHtml(avatarColor)};" aria-hidden="true">${escapeHtml(initials)}</span>
            </div>
            <span class="bonus-racer-name">${escapeHtml(firstName)}</span>
          </div>
          <span class="bonus-racer-gp bonus-racer-gp--major">${escapeHtml(formatCurrency(gp))}</span>
        </div>
        ${catchUpHtml}
      </li>`;
    }).join('');
    listEl.querySelectorAll('.bonus-racer[role="button"]').forEach((el) => {
      const tid = el.getAttribute('data-technician-id');
      if (tid && !el._bonusRaceClickBound) {
        el._bonusRaceClickBound = true;
        el.addEventListener('click', () => {
          if (getVisibleViewId() === 'view-technician-bonus' && tid) {
            technicianBonusState.selectedTechnicianId = tid;
            void fetchTechnicianBonusDashboard({ skipAdminOptions: true });
          }
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
          }
        });
      }
    });
    requestAnimationFrame(() => {
      listEl.style.opacity = '1';
    });
  } else {
    /* Desktop: original markup */
    listEl.innerHTML = rows.map((row, index) => {
      const rank = Number(row?.rank || (index + 1));
      const id = String(row?.technician_id || `row-${index}`);
      const prevRank = technicianBonusState.lastRanks.get(id);
      const changedRank = Number.isFinite(prevRank) && prevRank !== rank;
      nextRanks.set(id, rank);
      const initials = String(row?.avatar_initials || getBonusInitials(row?.display_name || '') || '--');
      const share = Math.max(0, Math.min(1, Number(row?.share_of_team_pot || 0)));
      const barWidth = Math.max(0, Math.min(100, share * 100));
      const crown = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#';
      const tooltipText = row.placeholder
        ? 'Peer leaderboard data will appear here after backend wiring.'
        : `${row.display_name}: ${formatCurrency(row.gp_contributed)} contributed (${formatBonusPercent(share)} of team share).`;
      const viewDetailsAria = row.placeholder
        ? 'View details'
        : `View details for ${escapeHtml(String(row.display_name || 'Unknown')).replace(/"/g, '&quot;')}`;
      return `<li class="bonus-racer${changedRank ? ' bonus-racer--overtake' : ''}" data-rank="${rank}">
        <div class="bonus-racer-top">
          <div class="bonus-racer-left">
            <span class="bonus-racer-rank" aria-label="Rank ${rank}">${crown}</span>
            <span class="bonus-racer-rank" aria-hidden="true">${escapeHtml(initials)}</span>
            <span class="bonus-racer-name">${escapeHtml(String(row.display_name || 'Unknown'))}</span>
          </div>
          <span class="bonus-racer-gp">${escapeHtml(formatCurrency(row.gp_contributed || 0))}</span>
        </div>
        <div class="bonus-racer-bar-wrap"><div class="bonus-racer-bar" style="--bar-width: ${barWidth.toFixed(2)}%;" role="presentation"></div></div>
        <div class="bonus-racer-meta">
          <span>${escapeHtml(formatBonusPercent(share))} of team share</span>
          ${changedRank ? '<span> • Overtake!</span>' : ''}
        </div>
        <button type="button" class="bonus-badge-chip bonus-badge-chip--pending" aria-label="${viewDetailsAria}" title="${escapeHtml(tooltipText)}" data-bonus-tooltip="${escapeHtml(tooltipText)}">View details</button>
      </li>`;
    }).join('');
    requestAnimationFrame(() => {
      listEl.querySelectorAll('.bonus-racer-bar').forEach((bar) => {
        bar.classList.add('bonus-racer-bar--filled');
      });
    });
  }

  const previousSelfRank = technicianBonusState.lastRanks.get(String(payload?.technician_context?.technician_id || 'self'));
  const selfRow = rows.find((row) => String(row.technician_id) === String(payload?.technician_context?.technician_id || 'self'));
  if (selfRow && Number.isFinite(previousSelfRank) && previousSelfRank !== selfRow.rank) {
    announceBonusRace(`Rank update: now in position ${selfRow.rank}.`);
  }
  technicianBonusState.lastRanks = nextRanks;
}

function renderBonusEffectsSummary(payload, jobs) {
  const effectsEl = document.getElementById('bonusEffectsSummary');
  if (!effectsEl) return;
  let doItAllCount = 0;
  let sniperCount = 0;
  let flatTireCount = 0;
  let redFlagCount = 0;
  let sniperEvidence = 'You nailed the quote tolerance window.';
  for (const job of jobs) {
    const roleBadges = Array.isArray(job?.role_badges) ? job.role_badges : [];
    const penalties = Array.isArray(job?.penalty_tags) ? job.penalty_tags : [];
    const estimation = job?.estimation || null;
    const explanations = Array.isArray(job?.explanations) ? job.explanations : [];
    if (roleBadges.some((badge) => String(badge || '').toLowerCase().includes('do-it-all'))) doItAllCount += 1;
    if (String(estimation?.status || '').toLowerCase() === 'pass') {
      sniperCount += 1;
      if (String(estimation?.message || '').trim()) sniperEvidence = String(estimation.message);
      if (explanations.length > 0) sniperEvidence = explanations[0];
    }
    for (const penalty of penalties) {
      const code = String(penalty?.code || '').toLowerCase();
      if (code === 'seller_fault_parts_runs') flatTireCount += 1;
      if (code === 'callback_bad_scoping' || code === 'callback_poor_workmanship') redFlagCount += 1;
    }
  }
  const hotStreakCount = Number(payload?.streak?.hot_streak_count || 0);
  const hotStreakActive = !!payload?.streak?.hot_streak_active;
  const chips = [
    {
      label: `🏅 Do It All ${doItAllCount > 0 ? `x${doItAllCount}` : ''}`.trim(),
      tone: doItAllCount > 0 ? 'positive' : 'pending',
      tooltip: doItAllCount > 0
        ? `${doItAllCount} job(s) where you sold and executed.`
        : 'Unlock when you sell and execute the same job on one visit.',
    },
    {
      label: `🎯 Sniper ${sniperCount > 0 ? `x${sniperCount}` : ''}`.trim(),
      tone: sniperCount > 0 ? 'positive' : 'pending',
      tooltip: sniperCount > 0 ? sniperEvidence : 'Unlock when actual labour lands inside tolerance.',
    },
    {
      label: `🔥 Hot Streak ${hotStreakActive ? `x${hotStreakCount}` : ''}`.trim(),
      tone: hotStreakActive ? 'positive' : 'pending',
      tooltip: hotStreakActive
        ? `${hotStreakCount} consecutive clean jobs.`
        : 'Pending backend streak wiring (5 clean jobs target).',
    },
    {
      label: `⚠️ Flat Tire ${flatTireCount > 0 ? `x${flatTireCount}` : ''}`.trim(),
      tone: flatTireCount > 0 ? 'warning' : 'pending',
      tooltip: flatTireCount > 0
        ? `${flatTireCount} unscheduled parts run penalties recorded.`
        : 'No unscheduled parts run penalties in this period.',
    },
    {
      label: `🚩 Red Flag ${redFlagCount > 0 ? `x${redFlagCount}` : ''}`.trim(),
      tone: redFlagCount > 0 ? 'warning' : 'pending',
      tooltip: redFlagCount > 0
        ? `${redFlagCount} callback-driven GP penalties recorded.`
        : 'No callback voids recorded in this period.',
    },
  ];
  effectsEl.innerHTML = chips.map((chip) => (
    `<button type="button" class="bonus-badge-chip bonus-badge-chip--${escapeHtml(chip.tone)}" title="${escapeHtml(chip.tooltip)}" data-bonus-tooltip="${escapeHtml(chip.tooltip)}">${escapeHtml(chip.label)}</button>`
  )).join('');
}

async function fetchAdminTechnicianOptions() {
  if (!isAdminRole()) {
    technicianBonusState.adminTechnicianOptions = [];
    return;
  }
  try {
    const resp = await fetch('/api/admin/user-permissions', {
      headers: { ...getAuthHeaders() },
    });
    if (handleAuthFailure(resp)) return;
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || 'Failed to load technicians.');
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const options = users
      .map((user) => ({
        user_id: String(user?.user_id || '').trim(),
        email: String(user?.email || '').trim(),
        role: normalizeAppRole(user?.role),
      }))
      .filter((user) => user.user_id)
      .sort((a, b) => a.email.localeCompare(b.email));
    technicianBonusState.adminTechnicianOptions = options;
  } catch (err) {
    console.error('Failed to load admin technician options', err);
    technicianBonusState.adminTechnicianOptions = [];
  }
}

function renderTechnicianBonusAdminSelector() {
  const select = document.getElementById('bonusAdminTechnicianSelect');
  if (!select) return;
  if (!isAdminRole()) {
    select.hidden = true;
    return;
  }
  const options = technicianBonusState.adminTechnicianOptions || [];
  const selfId = String(authState.user?.id || '').trim();
  const selectedCandidate = technicianBonusState.selectedTechnicianId || selfId;
  let selected = selectedCandidate;
  if (options.length > 0 && !options.some((option) => option.user_id === selected)) {
    selected = options[0].user_id;
  }
  if (!selected && selfId) selected = selfId;
  technicianBonusState.selectedTechnicianId = selected;
  const hasSelf = options.some((option) => option.user_id === selfId);
  const normalizedOptions = hasSelf || !selfId
    ? options
    : [{ user_id: selfId, email: authState.email || selfId, role: 'admin' }, ...options];
  select.innerHTML = normalizedOptions.map((option) => {
    const roleSuffix = option.role ? ` (${option.role})` : '';
    return `<option value="${escapeHtml(option.user_id)}">${escapeHtml(option.email || option.user_id)}${escapeHtml(roleSuffix)}</option>`;
  }).join('');
  if (!select.innerHTML && selfId) {
    select.innerHTML = `<option value="${escapeHtml(selfId)}">${escapeHtml(authState.email || selfId)} (self)</option>`;
  }
  if (technicianBonusState.selectedTechnicianId) {
    select.value = technicianBonusState.selectedTechnicianId;
  }
  select.hidden = false;
}

function renderTechnicianBonusDashboard(payload) {
  hideBonusTooltip();
  const periodNameEl = document.getElementById('bonusPeriodName');
  const periodDatesEl = document.getElementById('bonusPeriodDates');
  const periodStatusEl = document.getElementById('bonusPeriodStatusBadge');
  const teamPotEl = document.getElementById('bonusHeroTeamPot');
  const expectedPayoutEl = document.getElementById('bonusHeroExpectedPayout');
  const expectedPayoutNoteEl = document.getElementById('bonusHeroPayoutNote');
  const myGpEl = document.getElementById('bonusHeroMyGp');
  const ledgerListEl = document.getElementById('bonusLedgerList');
  const ledgerSubtitleEl = document.getElementById('bonusLedgerSubtitle');
  const emptyEl = document.getElementById('bonusDashboardEmpty');

  const period = payload?.period || null;
  const hero = payload?.hero || {};
  const ledger = payload?.ledger || {};
  const jobs = Array.isArray(ledger?.jobs) ? ledger.jobs : [];
  const previousPayload = technicianBonusState.previousPayload;
  const previousTeamPot = Number(previousPayload?.hero?.total_team_pot || 0);
  const previousMyGp = Number(previousPayload?.hero?.my_total_gp_contributed || 0);
  const teamPot = Number(hero?.total_team_pot || 0);
  const myGp = Number(hero?.my_total_gp_contributed || 0);
  /* 59.18.4: desktop uses same ledger chip markup as mobile (role/sniper/penalty) */
  const isMobileBonusView = true;

  if (periodNameEl) {
    periodNameEl.textContent = period?.period_name
      ? String(period.period_name)
      : 'No open bonus period';
  }
  if (periodDatesEl) {
    periodDatesEl.textContent = period
      ? formatBonusDateRange(period.start_date, period.end_date)
      : 'Ask admin to create or open a bonus period.';
  }
  if (periodStatusEl) {
    periodStatusEl.textContent = formatBonusStatusLabel(period?.status);
    periodStatusEl.dataset.status = String(period?.status || '').trim().toLowerCase();
  }
  if (teamPotEl) teamPotEl.textContent = formatCurrency(teamPot);
  if (myGpEl) myGpEl.textContent = formatCurrency(myGp);
  const isProvisional = payload?.is_provisional === true;
  const periodStatus = String(period?.status || '').trim().toLowerCase();
  const isPeriodClosed = periodStatus === 'closed';
  const expectedPayoutValue = hero?.my_expected_payout;
  const hasExpectedPayout = typeof expectedPayoutValue === 'number' && !isProvisional;
  if (expectedPayoutEl) {
    expectedPayoutEl.textContent = hasExpectedPayout ? formatCurrency(expectedPayoutValue) : 'Pending';
    expectedPayoutEl.dataset.locked = isPeriodClosed && hasExpectedPayout ? 'true' : '';
  }
  if (expectedPayoutNoteEl) {
    if (isPeriodClosed && hasExpectedPayout) {
      expectedPayoutNoteEl.textContent = 'Final payout (period closed).';
    } else if (hasExpectedPayout) {
      expectedPayoutNoteEl.textContent = 'Payout may change until the period is closed.';
    } else {
      expectedPayoutNoteEl.textContent = 'Expected payout unlocks after final rules and admin verification.';
    }
  }

  if (ledgerSubtitleEl) {
    const periodJobs = Number(hero?.period_job_count || 0);
    const myJobs = Number(hero?.technician_job_count || jobs.length || 0);
    ledgerSubtitleEl.textContent = period
      ? `${myJobs} of ${periodJobs} period job(s) linked to this technician.`
      : 'No period selected.';
  }

  if (!period || jobs.length === 0) {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = ledger?.empty_state || 'Zero jobs logged yet. Go close some deals!';
    }
  } else if (emptyEl) {
    emptyEl.hidden = true;
    emptyEl.textContent = '';
  }

  renderBonusRaceBoard(payload || {});
  renderBonusRaceLeaderboard(payload || {});
  renderBonusEffectsSummary(payload || {}, jobs);
  bindBonusTooltipInteractions();
  bindBonusTallyInteractions();

  if (!ledgerListEl) return;
  if (!period || jobs.length === 0) {
    ledgerListEl.innerHTML = '';
    technicianBonusState.previousPayload = payload || null;
    return;
  }

  ledgerListEl.innerHTML = jobs.map((job) => {
    const roleBadges = Array.isArray(job?.role_badges) ? job.role_badges : [];
    const penalties = Array.isArray(job?.penalty_tags) ? job.penalty_tags : [];
    const pendingReasonMessages = Array.isArray(job?.pending_reason_messages) ? job.pending_reason_messages : [];
    const explanations = Array.isArray(job?.explanations) ? job.explanations : [];
    const estimation = job?.estimation || null;
    const baseTooltip = explanations.length > 0
      ? explanations.join(' ')
      : 'No additional explanation recorded for this job.';
    const roleHtml = isMobileBonusView
      ? roleBadges.map((badge) => {
          const raw = String(badge || '').trim();
          const normalized = raw.toLowerCase();
          let label = raw;
          if (normalized.includes('do-it-all')) label = '🏅 Do It All';
          if (normalized === 'seller') label = '🧾 Seller';
          if (normalized === 'executor') label = '🛠 Executor';
          if (normalized === 'co-seller') label = '🤝 Co-Seller';
          if (normalized === 'co-executor') label = '🤝 Co-Executor';
          if (normalized === 'spotter') label = '👁 Spotter';
          return `<button type="button" class="bonus-badge-chip bonus-badge-chip--positive" title="${escapeHtml(baseTooltip)}" data-bonus-tooltip="${escapeHtml(baseTooltip)}">${escapeHtml(label)}</button>`;
        }).join('')
      : roleBadges.map((badge) => `<span class="bonus-role-badge">${escapeHtml(String(badge))}</span>`).join('');
    const sniperHtml = isMobileBonusView && String(estimation?.status || '').toLowerCase() === 'pass'
      ? `<button type="button" class="bonus-badge-chip bonus-badge-chip--positive" title="${escapeHtml(String(estimation?.message || 'Actual labour is inside tolerance.'))}" data-bonus-tooltip="${escapeHtml(String(estimation?.message || 'Actual labour is inside tolerance.'))}">🎯 Sniper</button>`
      : '';
    const penaltyHtml = isMobileBonusView
      ? penalties.map((penalty) => {
          const code = String(penalty?.code || '').toLowerCase();
          let label = String(penalty?.label || 'Penalty');
          if (code === 'seller_fault_parts_runs') label = '⚠️ Flat Tire';
          if (code === 'callback_bad_scoping' || code === 'callback_poor_workmanship') label = '🚩 Red Flag';
          return `<button type="button" class="bonus-badge-chip bonus-badge-chip--warning" title="${escapeHtml(String(penalty?.label || baseTooltip))}" data-bonus-tooltip="${escapeHtml(String(penalty?.label || baseTooltip))}">${escapeHtml(label)}</button>`;
        }).join('')
      : penalties.map((penalty) => (
          `<span class="bonus-penalty-tag" title="${escapeHtml(String(penalty?.label || 'Penalty'))}">${escapeHtml(String(penalty?.label || 'Penalty'))}</span>`
        )).join('');
    const pendingHtml = pendingReasonMessages.map((reason) => (
      `<span class="bonus-pending-tag">${escapeHtml(String(reason))}</span>`
    )).join('');
    const estimationHtml = estimation
      ? `<div class="bonus-estimation" data-status="${escapeHtml(String(estimation?.status || 'unknown'))}">
          <strong>Estimation:</strong>
          Quoted ${escapeHtml(String(estimation?.quoted_labor_minutes ?? 0))} min,
          Actual ${escapeHtml(String(estimation?.actual_labor_minutes ?? 0))} min
          ${estimation?.tolerance_minutes != null ? `, Tolerance ${escapeHtml(String(estimation.tolerance_minutes))} min` : ''}
          <div>${escapeHtml(String(estimation?.message || ''))}</div>
        </div>`
      : '';
    const explanationHtml = explanations.length > 0
      ? `<ul class="bonus-explanations">${explanations.map((line) => `<li>${escapeHtml(String(line))}</li>`).join('')}</ul>`
      : '';
    return `<article class="bonus-job-card">
      <div class="bonus-job-top">
        <div>
          <p class="bonus-job-id">${escapeHtml(String(job?.job_identifier || job?.servicem8_job_id || 'Unknown'))}</p>
        </div>
        <span class="bonus-job-date">${escapeHtml(formatBonusDateTime(job?.created_at))}</span>
      </div>
      ${(roleHtml || sniperHtml) ? `<div class="bonus-role-badges">${roleHtml}${sniperHtml}</div>` : ''}
      <div class="bonus-job-metrics">
        <div class="bonus-job-metric">
          <span class="bonus-job-metric-label">${job?.is_provisional === false ? 'Job GP' : 'Job GP (provisional)'}</span>
          <span class="bonus-job-metric-value">${escapeHtml(formatCurrency(job?.job_gp || 0))}</span>
        </div>
        <div class="bonus-job-metric">
          <span class="bonus-job-metric-label">My contribution</span>
          <span class="bonus-job-metric-value">${escapeHtml(formatCurrency(job?.my_job_gp_contribution || 0))}</span>
        </div>
      </div>
      ${estimationHtml}
      ${penaltyHtml ? `<div class="bonus-penalty-tags">${penaltyHtml}</div>` : ''}
      ${pendingHtml ? `<div class="bonus-pending-tags">${pendingHtml}</div>` : ''}
      ${explanationHtml}
    </article>`;
  }).join('');
  technicianBonusState.previousPayload = payload || null;
}

function stopTechnicianBonusPolling() {
  if (!technicianBonusState.pollTimerId) return;
  clearInterval(technicianBonusState.pollTimerId);
  technicianBonusState.pollTimerId = null;
}

function startTechnicianBonusPolling() {
  stopTechnicianBonusPolling();
  if (getVisibleViewId() !== 'view-technician-bonus') return;
  technicianBonusState.pollTimerId = setInterval(() => {
    if (getVisibleViewId() !== 'view-technician-bonus') return;
    if (document.visibilityState !== 'visible') return;
    if (technicianBonusState.loading) return;
    void fetchTechnicianBonusDashboard({ skipAdminOptions: true, silent: true });
  }, 30000);
}

async function fetchTechnicianBonusDashboard(options = {}) {
  if (!canAccessTechnicianBonusView()) {
    setBonusDashboardStatus('Your role does not allow bonus dashboard access.', 'error');
    return;
  }
  const isSilent = options.silent === true;
  const refreshBtn = document.getElementById('btnBonusRefresh');
  technicianBonusState.loading = true;
  if (refreshBtn && !isSilent) refreshBtn.disabled = true;
  if (!isSilent) setBonusDashboardStatus('Loading bonus dashboard…');

  try {
    if (isAdminRole() && options.skipAdminOptions !== true) {
      await fetchAdminTechnicianOptions();
      renderTechnicianBonusAdminSelector();
    }

    const params = new URLSearchParams();
    if (isAdminRole() && technicianBonusState.selectedTechnicianId) {
      params.set('technician_id', technicianBonusState.selectedTechnicianId);
    }
    const query = params.toString();
    const resp = await fetch(`/api/bonus/technician/dashboard${query ? `?${query}` : ''}`, {
      headers: { ...getAuthHeaders() },
    });
    if (handleAuthFailure(resp)) return;
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = typeof payload?.detail === 'string'
        ? payload.detail
        : (payload?.detail?.msg || 'Failed to load bonus dashboard.');
      throw new Error(detail);
    }
    technicianBonusState.payload = payload;
    const resolvedTechnicianId = String(payload?.technician_context?.technician_id || '').trim();
    if (isAdminRole() && resolvedTechnicianId) {
      technicianBonusState.selectedTechnicianId = resolvedTechnicianId;
      renderTechnicianBonusAdminSelector();
    }
    renderTechnicianBonusDashboard(payload);
    const forcedSelf = !!payload?.technician_context?.forced_self_context;
    if (forcedSelf) {
      setBonusDashboardStatus('You can only view your own dashboard in this role.', 'info');
    } else {
      if (!isSilent) setBonusDashboardStatus('');
    }
    startTechnicianBonusPolling();
  } catch (err) {
    console.error('Failed to load technician bonus dashboard', err);
    technicianBonusState.payload = null;
    renderTechnicianBonusDashboard(null);
    if (!isSilent) setBonusDashboardStatus(err?.message || 'Failed to load bonus dashboard.', 'error');
  } finally {
    technicianBonusState.loading = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function initTechnicianBonusView() {
  if (technicianBonusState.initialized) return;
  technicianBonusState.initialized = true;

  const backBtn = document.getElementById('btnBonusBackToCanvas');
  const refreshBtn = document.getElementById('btnBonusRefresh');
  const adminSelect = document.getElementById('bonusAdminTechnicianSelect');

  backBtn?.addEventListener('click', () => {
    switchView('view-canvas', { triggerEl: backBtn });
  });

  refreshBtn?.addEventListener('click', () => {
    void fetchTechnicianBonusDashboard();
  });

  adminSelect?.addEventListener('change', () => {
    technicianBonusState.selectedTechnicianId = String(adminSelect.value || '').trim();
    void fetchTechnicianBonusDashboard({ skipAdminOptions: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (getVisibleViewId() !== 'view-technician-bonus') return;
    if (document.visibilityState !== 'visible') return;
    void fetchTechnicianBonusDashboard({ skipAdminOptions: true, silent: true });
  });
}


  return {
    initProductsView,
    renderProductLibrary,
    initUserPermissionsView,
    fetchUserPermissions,
    initMaterialRulesView,
    fetchMaterialRules,
    initBonusAdminView,
    fetchBonusAdminPeriods,
    initTechnicianBonusView,
    fetchTechnicianBonusDashboard,
    startTechnicianBonusPolling,
    stopTechnicianBonusPolling,
    hideBonusTooltip,
    syncAdminDesktopAccess,
    openTechnicianBonusView,
    updateMobileBonusButtonVisibility,
  };
}
