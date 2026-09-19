async function checkVin() {
  const vinInput = document.getElementById('vin');
  const vin = (vinInput?.value || '').trim().toUpperCase();

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    alert('أدخل رقم هيكل VIN صحيحًا مكونًا من 17 خانة');
    return;
  }

  try {
    const response = await fetch(
      '/api/vin?vin=' + encodeURIComponent(vin)
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.detail ||
        data?.error ||
        'VIN lookup failed'
      );
    }

    const vehicles =
      data?.data?.matchingVehicles?.array || [];

    if (!vehicles.length) {
      alert(
        'تم فحص رقم الهيكل، لكن لم يتم العثور على سيارة مطابقة في كتالوج القطع.'
      );
      return;
    }

    const vehicle = vehicles[0];

    window.wafferVehicleId = vehicle.vehicleId;
    window.wafferModelId = vehicle.modelId;

    alert(
      'تم التعرف على السيارة:\n' +
      (vehicle.carName ||
       vehicle.vehicleTypeDescription ||
       '') +
      '\nVehicle ID: ' +
      vehicle.vehicleId
    );

  } catch (error) {
    console.error('VIN lookup error:', error);
    alert('تعذر التحقق من رقم الهيكل حاليًا.');
  }
}

document
  .getElementById('vin')
  ?.addEventListener('change', checkVin);
