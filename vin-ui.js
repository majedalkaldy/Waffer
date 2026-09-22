(function () {
  'use strict';

  function isEnglish() {
    return String(window.wafferLocale || '').startsWith('en');
  }

  let vinRequest = null;
  let vinRequestVin = '';
  let vinAbortController = null;
  let lastVin = '';
  let vinCandidates = [];

  function firstArray(obj, paths) {
    for (const path of paths) {
      let value = obj;
      for (const key of path) value = value?.[key];
      if (Array.isArray(value) && value.length) return value;
    }
    return [];
  }

  function pick(obj, keys) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  function sameId(value, expected) {
    return value != null && expected != null && String(value) === String(expected);
  }

  function findMakeOption(select, manufacturer) {
    if (!select || !manufacturer) return null;
    const id = String(pick(manufacturer, ['manuId', 'manufacturerId', 'id']) ?? '');
    const name = String(pick(manufacturer, ['manuName', 'manufacturerName', 'name']) ?? '').trim().toLowerCase();

    return Array.from(select.options).find(function (option) {
      const value = String(option.value ?? '');
      const text = String(option.textContent ?? '').trim().toLowerCase();
      return (id && value === id) || (name && text.includes(name));
    }) || null;
  }

  function candidateElements() {
    return {
      container: document.getElementById('vehicleCandidates'),
      select: document.getElementById('candidateSelect')
    };
  }

  function clearCandidateSelection() {
    vinCandidates = [];
    const { container, select } = candidateElements();
    if (select) select.replaceChildren();
    if (container) container.classList.add('hidden');
  }

  function clearResolvedVehicleState() {
    lastVin = '';
    window.wafferVehicleId = '';
    window.wafferModelId = '';
    window.wafferManufacturerId = '';
    window.wafferVehicle = null;
    clearCandidateSelection();

    const vehicleInfo = document.getElementById('vehicleInfo');
    if (vehicleInfo) {
      vehicleInfo.textContent = '';
      vehicleInfo.classList.add('hidden');
    }

    window.dispatchEvent(new CustomEvent('wafferVinCleared'));
  }

  function findRelatedModel(vehicle, models) {
    const modelId = pick(vehicle, ['modelId']);
    if (modelId != null) {
      const found = models.find(model => sameId(pick(model, ['modelId', 'id']), modelId));
      if (found) return found;
    }
    return models[0] || null;
  }

  function findRelatedManufacturer(vehicle, model, manufacturers) {
    const manufacturerId =
      pick(vehicle, ['manuId', 'manufacturerId']) ??
      pick(model, ['manuId', 'manufacturerId']);
    if (manufacturerId != null) {
      const found = manufacturers.find(manufacturer =>
        sameId(pick(manufacturer, ['manuId', 'manufacturerId', 'id']), manufacturerId)
      );
      if (found) return found;
    }
    return manufacturers[0] || null;
  }

  function buildCandidate(vehicle, models, manufacturers, result, vin) {
    const model = findRelatedModel(vehicle, models);
    const manufacturer = findRelatedManufacturer(vehicle, model, manufacturers);
    const vehicleId = pick(vehicle, ['vehicleId', 'carId', 'id']);
    if (vehicleId == null || vehicleId === '') return null;

    const modelId =
      pick(vehicle, ['modelId']) ??
      pick(model, ['modelId', 'id']);

    const manufacturerId =
      pick(vehicle, ['manuId', 'manufacturerId']) ??
      pick(model, ['manuId', 'manufacturerId']) ??
      pick(manufacturer, ['manuId', 'manufacturerId', 'id']);

    const manufacturerName =
      pick(manufacturer, ['manuName', 'manufacturerName', 'name']) ??
      pick(vehicle, ['manuName', 'manufacturerName', 'makeName']) ??
      '';

    const modelName =
      pick(model, ['modelName', 'name']) ??
      pick(vehicle, ['modelName']) ??
      '';

    const vehicleDescription =
      pick(vehicle, ['vehicleTypeDescription', 'typeName', 'description']) ?? '';

    const year =
      pick(vehicle, ['year', 'constructionYear', 'yearOfConstruction']) ??
      pick(result?.data, ['year']) ??
      null;

    return {
      vin,
      vehicleId: String(vehicleId),
      modelId: modelId != null ? String(modelId) : '',
      manufacturerId: manufacturerId != null ? String(manufacturerId) : '',
      manufacturerName: String(manufacturerName || ''),
      modelName: String(modelName || ''),
      vehicleDescription: String(vehicleDescription || ''),
      year: year && /^\d{4}$/.test(String(year)) ? String(year) : '',
      manufacturer,
      model,
      rawVehicle: vehicle,
      raw: result
    };
  }

  function candidateLabel(candidate) {
    const parts = [
      candidate.manufacturerName,
      candidate.modelName,
      candidate.year,
      candidate.vehicleDescription
    ].filter(Boolean);
    return (parts.join(' — ') || (isEnglish() ? 'Vehicle option' : 'خيار سيارة')) +
      ' | Vehicle ID: ' + candidate.vehicleId;
  }

  function applyCandidate(candidate) {
    if (!candidate) return null;

    window.wafferVehicleId = candidate.vehicleId;
    window.wafferModelId = candidate.modelId || '';
    window.wafferManufacturerId = candidate.manufacturerId || '';

    const makeSelect = document.getElementById('make');
    const modelInput = document.getElementById('model');
    const yearInput = document.getElementById('year');

    const makeOption = findMakeOption(makeSelect, candidate.manufacturer || candidate.rawVehicle);
    if (makeSelect) {
      let option = makeOption;
      if (!option && candidate.manufacturerId) {
        option = new Option(
          candidate.manufacturerName || (isEnglish() ? 'VIN identified make' : 'الشركة المحددة من VIN'),
          candidate.manufacturerId
        );
        makeSelect.add(option);
      }
      if (option) {
        makeSelect.value = option.value;
        makeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    if (modelInput && candidate.modelName) modelInput.value = candidate.modelName;
    if (yearInput && candidate.year) yearInput.value = candidate.year;

    lastVin = candidate.vin;
    const detail = {
      vin: candidate.vin,
      vehicleId: candidate.vehicleId,
      modelId: candidate.modelId,
      manufacturerId: candidate.manufacturerId,
      manufacturerName: candidate.manufacturerName,
      modelName: candidate.modelName,
      vehicleDescription: candidate.vehicleDescription,
      year: candidate.year,
      raw: candidate.raw
    };
    window.wafferVehicle = detail;

    const vehicleInfo = document.getElementById('vehicleInfo');
    if (vehicleInfo) {
      vehicleInfo.textContent =
        (isEnglish() ? '✓ Vehicle identified: ' : '✓ تم التعرف على السيارة: ') +
        candidateLabel(candidate);
      vehicleInfo.classList.remove('hidden');
    }

    const { container, select } = candidateElements();
    if (select) select.value = candidate.vehicleId;
    if (container) container.classList.add('hidden');

    window.dispatchEvent(new CustomEvent('wafferVinResolved', { detail }));
    return detail;
  }

  function showCandidateSelection(candidates) {
    const { container, select } = candidateElements();
    const vehicleInfo = document.getElementById('vehicleInfo');

    window.wafferVehicleId = '';
    window.wafferModelId = '';
    window.wafferManufacturerId = '';
    window.wafferVehicle = null;

    if (vehicleInfo) {
      vehicleInfo.textContent = isEnglish()
        ? 'Multiple vehicle variants match this VIN. Choose the exact variant before analysis.'
        : 'يوجد أكثر من فئة سيارة مطابقة لهذا VIN. اختر الفئة الصحيحة قبل التحليل.';
      vehicleInfo.classList.remove('hidden');
    }

    if (!select || !container) return;

    select.replaceChildren(
      new Option(
        isEnglish() ? 'Choose the matching vehicle variant' : 'اختر فئة السيارة المطابقة',
        ''
      )
    );
    for (const candidate of candidates) {
      select.add(new Option(candidateLabel(candidate), candidate.vehicleId));
    }
    container.classList.remove('hidden');
  }

  async function checkVin(force = false) {
    const vinInput = document.getElementById('vin');
    if (!vinInput) return null;

    const vin = String(vinInput.value || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;

    // Preserve an explicit candidate selection for the same VIN, even when start()
    // calls this function in force mode.
    if (vin === lastVin && window.wafferVehicleId && window.wafferVehicle) {
      return window.wafferVehicle;
    }

    if (vinRequest && vinRequestVin === vin) return vinRequest;
    if (vinRequest && vinRequestVin !== vin) {
      vinAbortController?.abort();
      vinRequest = null;
    }

    vinRequestVin = vin;
    vinAbortController = new AbortController();

    vinRequest = (async function () {
      try {
        const response = await fetch(
          '/api/vin?vin=' + encodeURIComponent(vin),
          { signal: vinAbortController.signal }
        );

        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error(isEnglish() ? 'Invalid VIN provider response' : 'استجابة VIN غير صالحة');
        }

        if (!response.ok) {
          throw new Error(
            result?.message ||
            result?.error ||
            (isEnglish() ? 'Could not verify the VIN' : 'تعذر التحقق من رقم الهيكل')
          );
        }

        const currentVin = String(document.getElementById('vin')?.value || '').trim().toUpperCase();
        if (currentVin !== vin) return null;

        const manufacturers = firstArray(result, [
          ['data', 'matchingManufacturers', 'array'],
          ['matchingManufacturers', 'array'],
          ['data', 'matchingManufacturers'],
          ['matchingManufacturers']
        ]);
        const models = firstArray(result, [
          ['data', 'matchingModels', 'array'],
          ['matchingModels', 'array'],
          ['data', 'matchingModels'],
          ['matchingModels']
        ]);
        const vehicles = firstArray(result, [
          ['data', 'matchingVehicles', 'array'],
          ['matchingVehicles', 'array'],
          ['data', 'matchingVehicles'],
          ['matchingVehicles']
        ]);

        const candidates = [];
        const seen = new Set();
        for (const vehicle of vehicles) {
          const candidate = buildCandidate(vehicle, models, manufacturers, result, vin);
          if (!candidate || seen.has(candidate.vehicleId)) continue;
          seen.add(candidate.vehicleId);
          candidates.push(candidate);
        }

        if (!candidates.length) {
          throw new Error(
            isEnglish()
              ? 'VIN checked, but no matching vehicle was found'
              : 'تم فحص رقم الهيكل ولكن لم يتم العثور على سيارة مطابقة'
          );
        }

        vinCandidates = candidates;

        if (candidates.length > 1) {
          lastVin = vin;
          showCandidateSelection(candidates);
          return {
            vin,
            ambiguous: true,
            candidates: candidates.map(candidate => ({
              vehicleId: candidate.vehicleId,
              manufacturerName: candidate.manufacturerName,
              modelName: candidate.modelName,
              vehicleDescription: candidate.vehicleDescription,
              year: candidate.year
            }))
          };
        }

        clearCandidateSelection();
        return applyCandidate(candidates[0]);

      } catch (error) {
        if (error?.name === 'AbortError') return null;
        throw error;
      } finally {
        if (vinRequestVin === vin) {
          vinRequest = null;
          vinRequestVin = '';
          vinAbortController = null;
        }
      }
    })();

    return vinRequest;
  }

  window.ensureWafferVehicle = function () {
    return checkVin(true);
  };

  window.checkWafferVin = checkVin;

  function attach() {
    const vinField = document.getElementById('vin');
    if (!vinField || vinField.dataset.wafferVinBound === '1') return;
    vinField.dataset.wafferVinBound = '1';

    const { select } = candidateElements();
    if (select && select.dataset.wafferCandidateBound !== '1') {
      select.dataset.wafferCandidateBound = '1';
      select.addEventListener('change', function () {
        const candidate = vinCandidates.find(item => item.vehicleId === String(select.value || ''));
        if (candidate) applyCandidate(candidate);
      });
    }

    vinField.addEventListener('input', function () {
      const current = String(vinField.value || '').trim().toUpperCase();
      if (current !== lastVin) clearResolvedVehicleState();
    });

    vinField.addEventListener('change', function () {
      checkVin(false).catch(function (error) {
        console.error('VIN lookup error:', error);
        alert(
          (isEnglish() ? 'Could not verify the VIN.\n' : 'تعذر التحقق من رقم الهيكل.\n') +
          (error?.message || '')
        );
      });
    });

    vinField.addEventListener('blur', function () {
      const vin = String(vinField.value || '').trim().toUpperCase();
      if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        checkVin(false).catch(function (error) {
          console.error('VIN lookup error:', error);
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
