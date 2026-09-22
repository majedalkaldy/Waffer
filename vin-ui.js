(function () {
  'use strict';

  let vinRequest = null;
  let vinRequestVin = '';
  let vinAbortController = null;
  let lastVin = '';

  function clearResolvedVehicleState() {
    lastVin = '';
    window.wafferVehicleId = '';
    window.wafferModelId = '';
    window.wafferManufacturerId = '';
    window.wafferVehicle = null;

    const vehicleInfo = document.getElementById('vehicleInfo');
    if (vehicleInfo) {
      vehicleInfo.textContent = '';
      vehicleInfo.classList.add('hidden');
    }

    window.dispatchEvent(new CustomEvent('wafferVinCleared'));
  }

  function firstArray(obj, paths) {
    for (const path of paths) {
      let value = obj;

      for (const key of path) {
        value = value?.[key];
      }

      if (Array.isArray(value) && value.length) {
        return value;
      }
    }

    return [];
  }

  function pick(obj, keys) {
    for (const key of keys) {
      const value = obj?.[key];

      if (
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        return value;
      }
    }

    return null;
  }

  function findMakeOption(select, manufacturer) {
    if (!select || !manufacturer) {
      return null;
    }

    const id = String(
      pick(
        manufacturer,
        ['manuId', 'manufacturerId', 'id']
      ) ?? ''
    );

    const name = String(
      pick(
        manufacturer,
        ['manuName', 'manufacturerName', 'name']
      ) ?? ''
    )
      .trim()
      .toLowerCase();

    return (
      Array.from(select.options).find(function (option) {
        const value = String(option.value ?? '');

        const text = String(
          option.textContent ?? ''
        )
          .trim()
          .toLowerCase();

        return (
          (id && value === id) ||
          (name && text.includes(name))
        );
      }) || null
    );
  }

  async function checkVin(force = false) {

    const vinInput =
      document.getElementById('vin');

    if (!vinInput) {
      return null;
    }

    const vin = String(
      vinInput.value || ''
    )
      .trim()
      .toUpperCase();

    // VIN يجب أن يكون 17 خانة
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return null;
    }

    // إذا سبق التعرف على نفس السيارة
    if (
      !force &&
      vin === lastVin &&
      window.wafferVehicleId
    ) {
      return {
        vehicleId:
          window.wafferVehicleId,

        modelId:
          window.wafferModelId,

        manufacturerId:
          window.wafferManufacturerId
      };
    }

    // منع الطلبات المتكررة لنفس VIN وإلغاء الطلب القديم إذا تغير VIN.
    if (vinRequest && vinRequestVin === vin) {
      return vinRequest;
    }

    if (vinRequest && vinRequestVin !== vin) {
      vinAbortController?.abort();
      vinRequest = null;
    }

    vinRequestVin = vin;
    vinAbortController = new AbortController();

    vinRequest = (async function () {

      try {

        const response = await fetch(
          '/api/vin?vin=' +
          encodeURIComponent(vin),
          { signal: vinAbortController.signal }
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
            'تعذر التحقق من رقم الهيكل'
          );
        }

        const currentVin = String(document.getElementById('vin')?.value || '')
          .trim()
          .toUpperCase();

        // إذا تغير VIN أثناء الطلب لا نسمح لرد قديم بتحديث السيارة الحالية.
        if (currentVin !== vin) {
          return null;
        }

        // الشركات المطابقة
        const manufacturers =
          firstArray(
            result,
            [
              [
                'data',
                'matchingManufacturers',
                'array'
              ],
              [
                'matchingManufacturers',
                'array'
              ],
              [
                'data',
                'matchingManufacturers'
              ],
              [
                'matchingManufacturers'
              ]
            ]
          );

        // الموديلات المطابقة
        const models =
          firstArray(
            result,
            [
              [
                'data',
                'matchingModels',
                'array'
              ],
              [
                'matchingModels',
                'array'
              ],
              [
                'data',
                'matchingModels'
              ],
              [
                'matchingModels'
              ]
            ]
          );

        // السيارات المطابقة
        const vehicles =
          firstArray(
            result,
            [
              [
                'data',
                'matchingVehicles',
                'array'
              ],
              [
                'matchingVehicles',
                'array'
              ],
              [
                'data',
                'matchingVehicles'
              ],
              [
                'matchingVehicles'
              ]
            ]
          );

        const manufacturer =
          manufacturers[0] || null;

        const model =
          models[0] || null;

        const vehicle =
          vehicles[0] || null;

        if (!vehicle) {
          throw new Error(
            'تم فحص رقم الهيكل ولكن لم يتم العثور على سيارة مطابقة'
          );
        }

        const vehicleId =
          pick(
            vehicle,
            [
              'vehicleId',
              'carId',
              'id'
            ]
          );

        const modelId =
          pick(
            vehicle,
            ['modelId']
          ) ??
          pick(
            model,
            [
              'modelId',
              'id'
            ]
          );

        const manufacturerId =
          pick(
            vehicle,
            [
              'manuId',
              'manufacturerId'
            ]
          ) ??
          pick(
            manufacturer,
            [
              'manuId',
              'manufacturerId',
              'id'
            ]
          );

        if (!vehicleId) {
          throw new Error(
            'تم العثور على السيارة لكن Vehicle ID غير متوفر'
          );
        }

        // حفظ المعرفات لاستخدامها في مطابقة القطع
        window.wafferVehicleId =
          String(vehicleId);

        window.wafferModelId =
          modelId != null
            ? String(modelId)
            : '';

        window.wafferManufacturerId =
          manufacturerId != null
            ? String(manufacturerId)
            : '';

        const makeSelect =
          document.getElementById('make');

        const modelInput =
          document.getElementById('model');

        const yearInput =
          document.getElementById('year');

        // اختيار الشركة تلقائياً
        const makeOption =
          findMakeOption(
            makeSelect,
            manufacturer
          );

        if (makeSelect && manufacturer) {
          let option = makeOption;
          if (!option) {
            const optionValue = String(
              pick(manufacturer, ['manuId','manufacturerId','id']) ?? ''
            );
            const optionText = String(
              pick(manufacturer, ['manuName','manufacturerName','name']) ?? 'الشركة المحددة من VIN'
            );
            if (optionValue) {
              option = new Option(optionText, optionValue);
              makeSelect.add(option);
            }
          }
          if (option) {
            makeSelect.value = option.value;
            makeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        // اسم الموديل
        const modelName =
          pick(
            model,
            [
              'modelName',
              'name'
            ]
          ) ??
          pick(
            vehicle,
            [
              'modelName',
              'vehicleTypeDescription',
              'typeName'
            ]
          );

        if (
          modelInput &&
          modelName
        ) {
          modelInput.value =
            String(modelName);
        }

        // سنة السيارة إذا كانت متوفرة
        const year =
          pick(
            vehicle,
            [
              'year',
              'constructionYear',
              'yearOfConstruction'
            ]
          ) ??
          pick(
            result?.data,
            ['year']
          );

        if (
          yearInput &&
          year &&
          /^\d{4}$/.test(
            String(year)
          )
        ) {
          yearInput.value =
            String(year);
        }

        lastVin = vin;

        const detail = {

          vin: vin,

          vehicleId:
            window.wafferVehicleId,

          modelId:
            window.wafferModelId,

          manufacturerId:
            window.wafferManufacturerId,

          manufacturerName:
            pick(
              manufacturer,
              [
                'manuName',
                'manufacturerName',
                'name'
              ]
            ) || '',

          modelName:
            modelName || '',

          vehicleDescription:
            pick(
              vehicle,
              [
                'vehicleTypeDescription',
                'typeName',
                'description'
              ]
            ) || '',

          raw: result
        };

        window.wafferVehicle =
          detail;

        const vehicleInfo =
          document.getElementById('vehicleInfo');

        if (vehicleInfo) {
          const parts = [
            detail.manufacturerName,
            detail.modelName,
            detail.vehicleDescription
          ].filter(Boolean);

          vehicleInfo.textContent =
            '✓ تم التعرف على السيارة' +
            (parts.length ? ': ' + parts.join(' — ') : '') +
            ' | Vehicle ID: ' + detail.vehicleId;

          vehicleInfo.classList.remove('hidden');
        }

        // إرسال حدث لبقية نظام وفر
        window.dispatchEvent(
          new CustomEvent(
            'wafferVinResolved',
            {
              detail: detail
            }
          )
        );

        return detail;

      } catch (error) {

        if (error?.name === 'AbortError') {
          return null;
        }

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

  // هذه الدالة يحتاجها index.html
  window.ensureWafferVehicle =
    function () {
      return checkVin(true);
    };

  window.checkWafferVin =
    checkVin;

  function attach() {

    const vinField =
      document.getElementById('vin');

    if (
      !vinField ||
      vinField.dataset.wafferVinBound === '1'
    ) {
      return;
    }

    vinField.dataset.wafferVinBound =
      '1';

    vinField.addEventListener(
      'input',
      function () {
        const current = String(vinField.value || '')
          .trim()
          .toUpperCase();

        if (current !== lastVin) {
          clearResolvedVehicleState();
        }
      }
    );

    // عند تغيير VIN
    vinField.addEventListener(
      'change',
      function () {

        checkVin(false)
          .catch(function (error) {

            console.error(
              'VIN lookup error:',
              error
            );

            alert(
              'تعذر التحقق من رقم الهيكل.\n' +
              (error?.message || '')
            );

          });

      }
    );

    // عند الخروج من خانة VIN
    vinField.addEventListener(
      'blur',
      function () {

        const vin = String(
          vinField.value || ''
        )
          .trim()
          .toUpperCase();

        if (
          /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)
        ) {

          checkVin(false)
            .catch(function (error) {

              console.error(
                'VIN lookup error:',
                error
              );

            });

        }

      }
    );
  }

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      attach
    );

  } else {

    attach();

  }

})();
