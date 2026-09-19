async function checkVin() {
  const vinInput = document.getElementById('vin');
  if (!vinInput) return;

  const vin = (vinInput.value || '').trim().toUpperCase();

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return;
  }

  try {
    const response = await fetch(
      '/api/vin?vin=' + encodeURIComponent(vin)
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result?.message ||
        result?.error ||
        'VIN lookup failed'
      );
    }

    const manufacturer =
      result?.data?.matchingManufacturers?.array?.[0];

    const model =
      result?.data?.matchingModels?.array?.[0];

    const vehicle =
      result?.data?.matchingVehicles?.array?.[0];

    if (!vehicle) {
      alert('تم فحص رقم الهيكل، ولكن لم يتم العثور على سيارة مطابقة.');
      return;
    }

    window.wafferVehicleId = vehicle.vehicleId;
    window.wafferModelId = vehicle.modelId;
    window.wafferManufacturerId = vehicle.manuId;

    const makeSelect = document.getElementById('make');
    const modelInput = document.getElementById('model');

    if (makeSelect && manufacturer) {
      const matchingOption = Array.from(makeSelect.options).find(
        option =>
          String(option.value) === String(manufacturer.manuId)
      );

      if (matchingOption) {
        makeSelect.value = matchingOption.value;
      }
    }

    if (modelInput && model) {
      modelInput.value = model.modelName || '';
    }

    alert(
      'تم التعرف على السيارة بنجاح ✅\n\n' +
      'الشركة: ' + (manufacturer?.manuName || '-') + '\n' +
      'الموديل: ' + (model?.modelName || '-') + '\n' +
      'المحرك: ' + (vehicle.vehicleTypeDescription || '-') + '\n' +
      'Vehicle ID: ' + vehicle.vehicleId
    );

  } catch (error) {
    console.error('VIN lookup error:', error);

    alert(
      'تعذر التحقق من رقم الهيكل.\n' +
      (error?.message || '')
    );
  }
}

const vinField = document.getElementById('vin');

if (vinField) {
  vinField.addEventListener('change', checkVin);
  vinField.addEventListener('blur', checkVin);
}
