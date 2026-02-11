import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LoginModal from '../components/LoginModal';
import { apiUrl } from '../config/api';
import useHeroImage from '../hooks/useHeroImage';

const FAQs = () => {
  const [showLogin, setShowLogin] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const heroImageStyle = useHeroImage();

  const toggleFAQ = (index) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const defaultFaqData = [
    {
      category: 'General Questions',
      questions: [
        {
          question: 'Do I need to know how to ski or snowboard to join?',
          answer: 'Absolutely not! We welcome members of all skill levels, from complete beginners to experienced riders. Many of our trips include optional lessons for beginners, and our community is supportive of those learning for the first time.'
        },
        {
          question: 'Can non-UMD students join trips?',
          answer: 'Our trips are primarily for UMD students, but guests may be allowed depending on availability. UMD students always have priority for trip spots. Contact us for more information about bringing guests.'
        }
      ]
    },
    {
      category: 'Trip Information',
      questions: [
        {
          question: 'How much do trips typically cost?',
          answer: 'Costs can vary, but generally it\'s not too expensive. Transportation is free, but there are things like lift tickets and equipment rental. We work hard to negotiate group rates to keep costs as affordable as possible for students.'
        },
        {
          question: 'Do I need my own equipment?',
          answer: 'No, equipment rental is available for all trips. You can choose a package that includes rental gear, or bring your own if you have it. Helmets are also available for rent and highly recommended for safety.'
        },
        {
          question: 'How do I register for trips?',
          answer: 'Trip registration opens one week before each trip date. You\'ll need to create an account and log in with your UMD credentials to register. Spots are limited to bus capacity (typically 54 seats), so be sure to register early!'
        },
        {
          question: 'What is the check-in process?',
          answer: 'All registered participants must confirm their attendance 2 days before the trip through our check-in system. You\'ll receive an email with a 24-hour window to complete this process. This helps us manage the waitlist effectively and ensure full buses.'
        }
      ]
    },
    {
      category: 'Membership & Benefits',
      questions: [
        {
          question: 'How do I become a member?',
          answer: 'Membership is automatically granted when you register for your first trip with us. There is no separate membership fee - we believe in providing value through our trips and events rather than charging for membership.'
        },
        {
          question: 'What benefits do members receive?',
          answer: 'Members get access to all our trips at discounted rates, invitations to social events throughout the year, eligibility for our points program that offers additional discounts, and connections to our partner shops for equipment deals and seasonal rentals.'
        }
      ]
    }
  ];

  const [faqData, setFaqData] = useState(defaultFaqData);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const res = await fetch(apiUrl('/api/faqs'), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            // Group by category
            const grouped = {};
            data.forEach(faq => {
              if (!grouped[faq.category]) grouped[faq.category] = [];
              grouped[faq.category].push({ question: faq.question, answer: faq.answer });
            });
            const ordered = Object.keys(grouped).map(cat => ({
              category: cat,
              questions: grouped[cat]
            }));
            setFaqData(ordered);
          }
        }
      } catch (e) {
        // silently fail — use hardcoded defaults
      }
    };
    fetchFaqs();
  }, []);

  let globalIndex = 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar onLoginClick={() => setShowLogin(true)} />

      <section className="hero" style={heroImageStyle}>
        <h2>Frequently Asked Questions</h2>
        <p>Find answers to common questions about the UMD Ski & Snowboard Club, our trips, and membership.</p>
      </section>

      {/* FAQ Section */}
      <section className="section">
        <div className="container">
          <div className="faq-container">
            {faqData.map((category, catIndex) => (
              <div className="faq-category" key={catIndex}>
                <h3 className="category-title">{category.category}</h3>
                {category.questions.map((faq, qIndex) => {
                  const currentIndex = globalIndex++;
                  return (
                    <div
                      className={`faq-item ${activeIndex === currentIndex ? 'active' : ''}`}
                      key={qIndex}
                    >
                      <div className="faq-question" onClick={() => toggleFAQ(currentIndex)}>
                        {faq.question}
                      </div>
                      <div className="faq-answer">
                        <p>{faq.answer}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Still Have Questions Section */}
      <section className="section questions-section">
        <div className="container">
          <div className="section-title">
            <h2>Still Have Questions?</h2>
          </div>

          <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
            <p style={{ marginBottom: '30px', fontSize: '18px' }}>
              If you couldn't find the answer to your question, feel free to reach out to us directly. We're always happy to help!
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <a href="https://groupme.com/join_group/90500359/FTrk1lQp" className="btn">Join the GroupMe</a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
};

export default FAQs;
