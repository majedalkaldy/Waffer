(function () {

  let vinRequest = null;
  let lastVin = '';

  async function checkVin(force = false) {

    const vinInput = document.getElementById('vin');

    if (!vinInput) {
      return null;
    }

    const vin = String(vinInput.value || '')
      .trim()
      .toUpperCase();

    // VIN يجب أن يكون 17 خانة
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return null;
    }

    // إذا تم التعرف على نفس VIN مسبقًا
    if (
      !force &&
      vin === lastVin &&
      window.wafferVehicleId
    ) {
      return {
        vehicleId: window.wafferVehicleId,
        modelId: window.wafferModelId,
        manufacturerId: window.wafferManufacturerId
      };
    }

    // منع تكرار نفس الطلب أثناء تنفيذه
    if (vinRequest) {
      return vinRequest;
    }

    vinRequest = (async function () {

      try {

        console.log('Waffer: checking VIN', vin);

        const response = await fetch(
          '/api/vin?vin=' +
          encodeURIComponent(vin)
        );

        let result;

        try {
          result = await response.json();
        } catch (e) {
          throw new Error(
            'استجابة VIN غير صالحة'
          );
        }

        if (!response.ok) {
          throw new Error(
            result?.message ||
            result?.error ||
            'VIN lookup failed'
          );
        }

        const manufacturer =
          result?.data
            ?.matchingManufacturers
            ?.array?.[
