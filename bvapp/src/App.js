// App.js
import React, { useState } from 'react';

const industries = {
  "Information Technology": ["IBM", "Intel", "Microsoft", "Nvidia", "ServiceNow"],
  "Health Care": ["AbbVie", "Cigna", "IQVIA", "Eli Lilly", "Pfizer"],
  "Finance": ["JP Morgan Chase", "PayPal", "Visa Inc", "Goldman Sachs", "American Express"],
};

const timePeriods = [
  "1 day", "5 days", "1 month", "3 months", "6 months", "1 year", "2 years", "5 years", "10 years", "Year to date", "All time"
];

function App() {
  const [industry, setIndustry] = useState('');
  const [company, setCompany] = useState('');
  const [timePeriod, setTimePeriod] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); // Start loading
    try {
      const response = await fetch('/api/stock-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          industry,
          company,
          time_period: timePeriod,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false); // Stop loading
    }
  };

  return (
    <div style={styles.app}>
      <h1 style={styles.header}>Stock Data Viewer</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Industry:</label>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={styles.select}>
            <option value="">Select Industry</option>
            {Object.keys(industries).map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Company:</label>
          <select value={company} onChange={(e) => setCompany(e.target.value)} disabled={!industry} style={styles.select}>
            <option value="">Select Company</option>
            {industry && industries[industry].map((comp) => (
              <option key={comp} value={comp}>{comp}</option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Time Period:</label>
          <select value={timePeriod} onChange={(e) => setTimePeriod(e.target.value)} style={styles.select}>
            <option value="">Select Time Period</option>
            {timePeriods.map((period) => (
              <option key={period} value={period}>{period}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={timePeriod == '' || industry == '' || company == ''}>Get Data</button>
      </form>

      {result && (
        <div style={styles.resultContainer}>
          {loading && <div style={styles.overlay}>
            <div style={styles.loader}></div>
          </div>}
          <div style={loading ? styles.resultLoading : styles.result}>
            <h2>Results for {result.ticker_symbol}</h2>
            <img src={`data:image/png;base64,${result.plot_url}`} alt="Stock Plot" style={styles.image} />
            <ul style={styles.list}>
              {Object.entries(result.summary_data).map(([key, value]) => (
                <li key={key} style={styles.listItem}>{key}: {value}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    textAlign: 'center',
  },
  header: {
    color: '#333',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  formGroup: {
    marginBottom: '15px',
    width: '100%',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
  },
  select: {
    width: '100%',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#007BFF',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  resultContainer: {
    position: 'relative',
    marginTop: '20px',
  },
  result: {
    textAlign: 'left',
    position: 'relative',
    zIndex: 1,
  },
  resultLoading: {
    textAlign: 'left',
    position: 'relative',
    zIndex: 1,
    opacity: 0.5,
  },
  image: {
    maxWidth: '100%',
    height: 'auto',
    marginBottom: '20px',
  },
  list: {
    listStyleType: 'none',
    padding: '0',
  },
  listItem: {
    marginBottom: '10px',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  loader: {
    border: '16px solid #f3f3f3',
    borderRadius: '50%',
    borderTop: '16px solid #3498db',
    width: '60px',
    height: '60px',
    animation: 'spin 2s linear infinite',
  },
  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
};

export default App;