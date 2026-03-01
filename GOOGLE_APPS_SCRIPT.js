/**
 * GOOGLE APPS SCRIPT FOR HEALTH RECORDS
 * 
 * Instructions:
 * 1. Open a Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any existing code and paste this code.
 * 4. Click 'Deploy' > 'New Deployment'.
 * 5. Select 'Web App'.
 * 6. Set 'Execute as' to 'Me'.
 * 7. Set 'Who has access' to 'Anyone'.
 * 8. Click 'Deploy' and copy the 'Web App URL'.
 * 9. Paste the URL into your app's environment variables as GAS_WEB_APP_URL.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Handle Delete Action
    if (data.action === 'delete' && data.timestamp) {
      var rows = sheet.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) {
        if (rows[i][0] === data.timestamp) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "status": "success", "message": "Record deleted" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Create headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp", 
        "Caregiver Name", 
        "SpO2", 
        "Pulse", 
        "Temperature", 
        "Systolic", 
        "Diastolic", 
        "Blood Sugar", 
        "Medications", 
        "Notes"
      ]);
      // Format header
      sheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#f3f4f6");
    }
    
    // Append data
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.caregiver_name || "Unknown",
      data.spo2 || "",
      data.pulse || "",
      data.temperature || "",
      data.systolic || "",
      data.diastolic || "",
      data.blood_sugar || "",
      data.medications || "",
      data.notes || ""
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    
    var headers = data[0];
    var rows = data.slice(1);
    
    // Hardcoded mapping to ensure frontend compatibility
    var result = rows.map(function(row) {
      return {
        id: row[0], // Use timestamp as ID
        timestamp: row[0],
        caregiver_name: row[1],
        spo2: row[2] ? Number(row[2]) : null,
        pulse: row[3] ? Number(row[3]) : null,
        temperature: row[4] ? Number(row[4]) : null,
        systolic: row[5] ? Number(row[5]) : null,
        diastolic: row[6] ? Number(row[6]) : null,
        blood_sugar: row[7] ? Number(row[7]) : null,
        medications: row[8] || "",
        notes: row[9] || ""
      };
    });
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
